package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"crackledate-web/internal/game"
	"golang.org/x/crypto/argon2"
)

const sessionCookieName = "crackledate_session"
const passwordMinLength = 8
const passwordMaxLength = 128
const verificationExpiry = 30 * time.Minute
const sessionDuration = 30 * 24 * time.Hour

type authService struct {
	db     *sql.DB
	email  emailConfig
	now    func() time.Time
	random func(int) ([]byte, error)
	code   func() (string, error)
}

type emailConfig struct {
	host          string
	port          string
	username      string
	password      string
	from          string
	publicBaseURL string
}

type authUser struct {
	ID            int64
	Email         string
	EmailVerified bool
}

type authUserResponse struct {
	ID            int64  `json:"id"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
}

type authSession struct {
	token   string
	expires time.Time
}

type signupRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	ThemePreference string `json:"themePreference,omitempty"`
	DifficultyMode  string `json:"difficultyMode,omitempty"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type verifyCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type resendVerificationRequest struct {
	Email string `json:"email"`
}

type preferencesRequest struct {
	ThemePreference string `json:"themePreference"`
	DifficultyMode  string `json:"difficultyMode"`
}

type preferencesResponse struct {
	ThemePreference string `json:"themePreference"`
	DifficultyMode  string `json:"difficultyMode"`
}

type accountSolution struct {
	Equation         string `json:"equation"`
	Timestamp        string `json:"timestamp"`
	Seconds          int    `json:"seconds"`
	Value            string `json:"value"`
	Mode             string `json:"mode,omitempty"`
	TargetValue      string `json:"targetValue,omitempty"`
	SolvedOnOtherDay bool   `json:"solvedOnOtherDay,omitempty"`
	UsedHint         bool   `json:"usedHint,omitempty"`
	Difficulty       string `json:"difficulty,omitempty"`
}

type importSolutionsRequest struct {
	Solutions map[string][]accountSolution `json:"solutions"`
}

func newAuthService(db *sql.DB, email emailConfig, now func() time.Time) (*authService, error) {
	service := &authService{
		db:     db,
		email:  email,
		now:    now,
		random: randomBytes,
		code:   randomCode,
	}
	if service.now == nil {
		service.now = time.Now
	}
	if service.db == nil {
		return service, nil
	}
	if err := ensureAccountSchema(service.db); err != nil {
		return nil, err
	}
	return service, nil
}

func emailConfigFromEnvironment() emailConfig {
	return emailConfig{
		host:          strings.TrimSpace(os.Getenv("SMTP_HOST")),
		port:          strings.TrimSpace(os.Getenv("SMTP_PORT")),
		username:      strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		password:      strings.TrimSpace(os.Getenv("SMTP_PASSWORD")),
		from:          strings.TrimSpace(os.Getenv("SMTP_FROM")),
		publicBaseURL: strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")), "/"),
	}
}

func ensureAccountSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			email_verified_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS email_verifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			code_hash TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			consumed_at TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS user_preferences (
			user_id INTEGER PRIMARY KEY,
			theme_preference TEXT NOT NULL,
			difficulty_mode TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS user_solutions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			puzzle_date TEXT NOT NULL,
			equation TEXT NOT NULL,
			value TEXT NOT NULL,
			solve_time_seconds INTEGER NOT NULL,
			submitted_at TEXT NOT NULL,
			source TEXT NOT NULL,
			UNIQUE (user_id, puzzle_date, equation),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);`,
		`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);`,
		`CREATE INDEX IF NOT EXISTS email_verifications_token_hash_idx ON email_verifications (token_hash);`,
		`CREATE INDEX IF NOT EXISTS user_solutions_user_date_idx ON user_solutions (user_id, puzzle_date);`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

func (service *authService) handleSignup(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	var payload signupRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	email, err := normalizeEmail(payload.Email)
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Enter a valid email address"})
		return
	}
	if err := validatePassword(email, payload.Password); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	themePreference, err := normalizedThemePreference(payload.ThemePreference)
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	difficultyMode, err := normalizedDifficulty(payload.DifficultyMode)
	if err != nil {
		difficultyMode = "easy"
	}
	passwordHash, err := hashPassword(payload.Password)
	if err != nil {
		logServerError("hash password", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not create account"})
		return
	}

	now := service.now().UTC().Format(time.RFC3339)
	result, err := service.db.Exec(
		`INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		email,
		passwordHash,
		now,
		now,
	)
	if err != nil {
		writeJSON(writer, http.StatusConflict, map[string]string{"error": "An account already exists for that email"})
		return
	}
	userID, err := result.LastInsertId()
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not create account"})
		return
	}
	if err := service.savePreferences(userID, themePreference, difficultyMode); err != nil {
		logServerError("save account preferences", err)
	}
	token, code, err := service.createVerification(userID)
	if err != nil {
		logServerError("create verification", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not create verification"})
		return
	}
	user := authUser{ID: userID, Email: email, EmailVerified: false}
	if err := service.sendVerificationEmail(request, user, token, code); err != nil {
		logServerError("send verification email", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not send verification email"})
		return
	}
	session, err := service.createSession(userID)
	if err != nil {
		logServerError("create session", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not sign in"})
		return
	}
	setSessionCookie(writer, request, session)
	writeJSON(writer, http.StatusCreated, map[string]any{"user": user.toResponse()})
}

func (service *authService) handleLogin(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	var payload loginRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	email, err := normalizeEmail(payload.Email)
	if err != nil {
		writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}
	user, passwordHash, err := service.userWithPasswordHash(email)
	if err != nil || !verifyPassword(payload.Password, passwordHash) {
		writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}
	session, err := service.createSession(user.ID)
	if err != nil {
		logServerError("create session", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not sign in"})
		return
	}
	setSessionCookie(writer, request, session)
	writeJSON(writer, http.StatusOK, map[string]any{"user": user.toResponse()})
}

func (service *authService) handleLogout(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	if cookie, err := request.Cookie(sessionCookieName); err == nil {
		_, _ = service.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(cookie.Value))
	}
	clearSessionCookie(writer, request)
	writeJSON(writer, http.StatusOK, map[string]bool{"signedOut": true})
}

func (service *authService) handleMe(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) {
		return
	}
	user, err := service.currentUser(request)
	if err != nil {
		logServerError("load current user", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not load account"})
		return
	}
	if user == nil {
		writeJSON(writer, http.StatusOK, map[string]any{"user": nil})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": user.toResponse()})
}

func (service *authService) handleVerifyLink(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) {
		return
	}
	userID, err := service.verifyByToken(request.URL.Query().Get("token"))
	if err != nil {
		http.Redirect(writer, request, "/?verified=0", http.StatusFound)
		return
	}
	session, err := service.createSession(userID)
	if err != nil {
		http.Redirect(writer, request, "/?verified=0", http.StatusFound)
		return
	}
	setSessionCookie(writer, request, session)
	http.Redirect(writer, request, "/?verified=1", http.StatusFound)
}

func (service *authService) handleVerifyCode(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	var payload verifyCodeRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	email, err := normalizeEmail(payload.Email)
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Enter a valid email address"})
		return
	}
	userID, err := service.verifyByCode(email, payload.Code)
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid or expired verification code"})
		return
	}
	session, err := service.createSession(userID)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not sign in"})
		return
	}
	setSessionCookie(writer, request, session)
	user, err := service.userByID(userID)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not load account"})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": user.toResponse()})
}

func (service *authService) handleResendVerification(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	var payload resendVerificationRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	email, err := normalizeEmail(payload.Email)
	if err != nil {
		writeJSON(writer, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	user, err := service.userByEmail(email)
	if err == nil && !user.EmailVerified {
		token, code, createErr := service.createVerification(user.ID)
		if createErr == nil {
			_ = service.sendVerificationEmail(request, *user, token, code)
		}
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"sent": true})
}

func (service *authService) handlePreferences(writer http.ResponseWriter, request *http.Request) {
	if !service.available(writer) {
		return
	}
	user, ok := service.requireVerifiedUser(writer, request)
	if !ok {
		return
	}
	switch request.Method {
	case http.MethodGet:
		preferences, err := service.loadPreferences(user.ID)
		if err != nil {
			writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not load preferences"})
			return
		}
		writeJSON(writer, http.StatusOK, preferences)
	case http.MethodPut:
		if !allowSameOrigin(writer, request) {
			return
		}
		var payload preferencesRequest
		if err := decodeJSONBody(writer, request, &payload); err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}
		themePreference, err := normalizedThemePreference(payload.ThemePreference)
		if err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		difficultyMode, err := normalizedDifficulty(payload.DifficultyMode)
		if err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if err := service.savePreferences(user.ID, themePreference, difficultyMode); err != nil {
			writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not save preferences"})
			return
		}
		writeJSON(writer, http.StatusOK, preferencesResponse{ThemePreference: themePreference, DifficultyMode: difficultyMode})
	default:
		writer.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (service *authService) handleSolutions(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) {
		return
	}
	user, ok := service.requireVerifiedUser(writer, request)
	if !ok {
		return
	}
	solutions, err := service.loadSolutions(user.ID)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not load solutions"})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"solutions": solutions})
}

func (service *authService) handleImportSolutions(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !service.available(writer) || !allowSameOrigin(writer, request) {
		return
	}
	user, ok := service.requireVerifiedUser(writer, request)
	if !ok {
		return
	}
	var payload importSolutionsRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	imported, err := service.importSolutions(user.ID, payload.Solutions)
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]int{"imported": imported})
}

func (service *authService) available(writer http.ResponseWriter) bool {
	if service == nil || service.db == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "Accounts require SQLite storage"})
		return false
	}
	return true
}

func (service *authService) requireVerifiedUser(writer http.ResponseWriter, request *http.Request) (*authUser, bool) {
	user, err := service.currentUser(request)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not load account"})
		return nil, false
	}
	if user == nil {
		writeJSON(writer, http.StatusUnauthorized, map[string]string{"error": "Sign in required"})
		return nil, false
	}
	if !user.EmailVerified {
		writeJSON(writer, http.StatusForbidden, map[string]string{"error": "Verify your email first"})
		return nil, false
	}
	return user, true
}

func (service *authService) currentVerifiedUser(request *http.Request) *authUser {
	user, err := service.currentUser(request)
	if err != nil || user == nil || !user.EmailVerified {
		return nil
	}
	return user
}

func (service *authService) currentUser(request *http.Request) (*authUser, error) {
	if service == nil || service.db == nil {
		return nil, nil
	}
	cookie, err := request.Cookie(sessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return nil, nil
	}
	tokenHash := hashToken(cookie.Value)
	var user authUser
	var expiresAtText string
	var verifiedAt sql.NullString
	err = service.db.QueryRow(`
		SELECT users.id, users.email, users.email_verified_at, sessions.expires_at
		FROM sessions
		JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ?
	`, tokenHash).Scan(&user.ID, &user.Email, &verifiedAt, &expiresAtText)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtText)
	if err != nil || !expiresAt.After(service.now()) {
		_, _ = service.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
		return nil, nil
	}
	user.EmailVerified = verifiedAt.Valid && verifiedAt.String != ""
	return &user, nil
}

func (service *authService) userByID(userID int64) (*authUser, error) {
	var user authUser
	var verifiedAt sql.NullString
	err := service.db.QueryRow(`SELECT id, email, email_verified_at FROM users WHERE id = ?`, userID).Scan(&user.ID, &user.Email, &verifiedAt)
	if err != nil {
		return nil, err
	}
	user.EmailVerified = verifiedAt.Valid && verifiedAt.String != ""
	return &user, nil
}

func (service *authService) userByEmail(email string) (*authUser, error) {
	var user authUser
	var verifiedAt sql.NullString
	err := service.db.QueryRow(`SELECT id, email, email_verified_at FROM users WHERE email = ?`, email).Scan(&user.ID, &user.Email, &verifiedAt)
	if err != nil {
		return nil, err
	}
	user.EmailVerified = verifiedAt.Valid && verifiedAt.String != ""
	return &user, nil
}

func (service *authService) userWithPasswordHash(email string) (authUser, string, error) {
	var user authUser
	var verifiedAt sql.NullString
	var passwordHash string
	err := service.db.QueryRow(`SELECT id, email, password_hash, email_verified_at FROM users WHERE email = ?`, email).Scan(
		&user.ID,
		&user.Email,
		&passwordHash,
		&verifiedAt,
	)
	user.EmailVerified = verifiedAt.Valid && verifiedAt.String != ""
	return user, passwordHash, err
}

func (service *authService) createSession(userID int64) (authSession, error) {
	tokenBytes, err := service.random(32)
	if err != nil {
		return authSession{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	now := service.now().UTC()
	expires := now.Add(sessionDuration)
	_, _ = service.db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, now.Format(time.RFC3339))
	_, err = service.db.Exec(
		`INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		userID,
		hashToken(token),
		expires.Format(time.RFC3339),
		now.Format(time.RFC3339),
	)
	if err != nil {
		return authSession{}, err
	}
	return authSession{token: token, expires: expires}, nil
}

func (service *authService) createVerification(userID int64) (string, string, error) {
	tokenBytes, err := service.random(32)
	if err != nil {
		return "", "", err
	}
	code, err := service.code()
	if err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	now := service.now().UTC()
	expires := now.Add(verificationExpiry)
	_, _ = service.db.Exec(`DELETE FROM email_verifications WHERE user_id = ? AND consumed_at IS NULL`, userID)
	_, err = service.db.Exec(
		`INSERT INTO email_verifications (user_id, token_hash, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		userID,
		hashToken(token),
		hashVerificationCode(userID, code),
		expires.Format(time.RFC3339),
		now.Format(time.RFC3339),
	)
	return token, code, err
}

func (service *authService) verifyByToken(token string) (int64, error) {
	if strings.TrimSpace(token) == "" {
		return 0, errors.New("missing verification token")
	}
	var verificationID int64
	var userID int64
	var expiresAtText string
	var consumedAt sql.NullString
	err := service.db.QueryRow(
		`SELECT id, user_id, expires_at, consumed_at FROM email_verifications WHERE token_hash = ?`,
		hashToken(token),
	).Scan(&verificationID, &userID, &expiresAtText, &consumedAt)
	if err != nil {
		return 0, err
	}
	return service.consumeVerification(verificationID, userID, expiresAtText, consumedAt)
}

func (service *authService) verifyByCode(email string, code string) (int64, error) {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return 0, errors.New("invalid code")
	}
	user, err := service.userByEmail(email)
	if err != nil {
		return 0, err
	}
	var verificationID int64
	var expiresAtText string
	var consumedAt sql.NullString
	err = service.db.QueryRow(
		`SELECT id, expires_at, consumed_at FROM email_verifications WHERE user_id = ? AND code_hash = ? ORDER BY id DESC LIMIT 1`,
		user.ID,
		hashVerificationCode(user.ID, code),
	).Scan(&verificationID, &expiresAtText, &consumedAt)
	if err != nil {
		return 0, err
	}
	return service.consumeVerification(verificationID, user.ID, expiresAtText, consumedAt)
}

func (service *authService) consumeVerification(verificationID int64, userID int64, expiresAtText string, consumedAt sql.NullString) (int64, error) {
	if consumedAt.Valid && consumedAt.String != "" {
		return 0, errors.New("verification already used")
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtText)
	if err != nil || !expiresAt.After(service.now()) {
		return 0, errors.New("verification expired")
	}
	now := service.now().UTC().Format(time.RFC3339)
	tx, err := service.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE email_verifications SET consumed_at = ? WHERE id = ?`, now, verificationID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`, now, now, userID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return userID, nil
}

func (service *authService) loadPreferences(userID int64) (preferencesResponse, error) {
	preferences := preferencesResponse{ThemePreference: "system", DifficultyMode: "easy"}
	err := service.db.QueryRow(`SELECT theme_preference, difficulty_mode FROM user_preferences WHERE user_id = ?`, userID).Scan(
		&preferences.ThemePreference,
		&preferences.DifficultyMode,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return preferences, nil
	}
	return preferences, err
}

func (service *authService) savePreferences(userID int64, themePreference string, difficultyMode string) error {
	now := service.now().UTC().Format(time.RFC3339)
	_, err := service.db.Exec(`
		INSERT INTO user_preferences (user_id, theme_preference, difficulty_mode, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			theme_preference = excluded.theme_preference,
			difficulty_mode = excluded.difficulty_mode,
			updated_at = excluded.updated_at
	`, userID, themePreference, difficultyMode, now)
	return err
}

func (service *authService) loadSolutions(userID int64) (map[string][]accountSolution, error) {
	rows, err := service.db.Query(`
		SELECT puzzle_date, equation, value, solve_time_seconds, submitted_at
		FROM user_solutions
		WHERE user_id = ?
		ORDER BY submitted_at ASC, id ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	solutions := make(map[string][]accountSolution)
	for rows.Next() {
		var puzzleDate string
		var solution accountSolution
		if err := rows.Scan(&puzzleDate, &solution.Equation, &solution.Value, &solution.Seconds, &solution.Timestamp); err != nil {
			return nil, err
		}
		solutions[puzzleDate] = append(solutions[puzzleDate], solution)
	}
	return solutions, rows.Err()
}

func (service *authService) importSolutions(userID int64, solutions map[string][]accountSolution) (int, error) {
	if len(solutions) == 0 {
		return 0, nil
	}
	imported := 0
	seen := 0
	for puzzleDate, entries := range solutions {
		date, err := game.ParsePuzzleDate(puzzleDate, service.now())
		if err != nil {
			return 0, errors.New("Invalid solution date")
		}
		dateIdentifier := date.Format("2006-01-02")
		for _, solution := range entries {
			seen++
			if seen > 1000 {
				return 0, errors.New("Too many solutions to import")
			}
			equation := strings.TrimSpace(solution.Equation)
			if equation == "" || len(equation) > 512 {
				continue
			}
			seconds := solution.Seconds
			if seconds < 0 || seconds > 24*60*60 {
				seconds = 0
			}
			value := trimMax(solution.Value, 128)
			timestamp := strings.TrimSpace(solution.Timestamp)
			if _, err := time.Parse(time.RFC3339, timestamp); err != nil {
				timestamp = service.now().UTC().Format(time.RFC3339)
			}
			result, err := insertUserSolution(service.db, userID, dateIdentifier, equation, value, seconds, timestamp, "import")
			if err != nil {
				return 0, err
			}
			if rows, _ := result.RowsAffected(); rows > 0 {
				imported++
			}
		}
	}
	return imported, nil
}

func insertUserSolution(db *sql.DB, userID int64, puzzleDate string, equation string, value string, seconds int, submittedAt string, source string) (sql.Result, error) {
	return db.Exec(`
		INSERT OR IGNORE INTO user_solutions (
			user_id,
			puzzle_date,
			equation,
			value,
			solve_time_seconds,
			submitted_at,
			source
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`, userID, puzzleDate, equation, value, seconds, submittedAt, source)
}

func (service *authService) sendVerificationEmail(request *http.Request, user authUser, token string, code string) error {
	baseURL := service.email.publicBaseURL
	if baseURL == "" {
		baseURL = publicBaseURLFromRequest(request)
	}
	verifyURL := baseURL + "/api/auth/verify?token=" + url.QueryEscape(token)
	subject := "Verify your Crackle Date account"
	body := fmt.Sprintf("Verify your Crackle Date account:\n\n%s\n\nOr enter this code in the app: %s\n\nThis expires in 30 minutes.\n", verifyURL, code)
	if service.email.host == "" || service.email.from == "" {
		fmt.Fprintf(os.Stderr, "verification email for %s\nlink: %s\ncode: %s\n", user.Email, verifyURL, code)
		return nil
	}
	port := service.email.port
	if port == "" {
		port = "587"
	}
	message := []byte("To: " + user.Email + "\r\n" +
		"From: " + service.email.from + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Content-Type: text/plain; charset=utf-8\r\n\r\n" +
		body)
	var auth smtp.Auth
	if service.email.username != "" || service.email.password != "" {
		auth = smtp.PlainAuth("", service.email.username, service.email.password, service.email.host)
	}
	return smtp.SendMail(service.email.host+":"+port, auth, service.email.from, []string{user.Email}, message)
}

func publicBaseURLFromRequest(request *http.Request) string {
	scheme := strings.TrimSpace(request.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return scheme + "://" + request.Host
}

func setSessionCookie(writer http.ResponseWriter, request *http.Request, session authSession) {
	http.SetCookie(writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    session.token,
		Path:     "/",
		Expires:  session.expires,
		MaxAge:   int(time.Until(session.expires).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie(request),
	})
}

func clearSessionCookie(writer http.ResponseWriter, request *http.Request) {
	http.SetCookie(writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie(request),
	})
}

func secureCookie(request *http.Request) bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("SESSION_COOKIE_SECURE")), "true") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(request.Header.Get("X-Forwarded-Proto")), "https") {
		return true
	}
	return request.TLS != nil
}

func allowSameOrigin(writer http.ResponseWriter, request *http.Request) bool {
	origin := strings.TrimSpace(request.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"error": "Cross-origin request blocked"})
		return false
	}
	if strings.EqualFold(parsed.Host, request.Host) {
		return true
	}
	// For local development, allow requests between localhost/127.0.0.1 on different ports
	isLocal := func(h string) bool {
		hostOnly := h
		if strings.Contains(h, ":") {
			hostOnly, _, _ = strings.Cut(h, ":")
		}
		hostOnly = strings.Trim(hostOnly, "[]")
		return hostOnly == "localhost" || hostOnly == "127.0.0.1" || hostOnly == "::1"
	}
	if isLocal(parsed.Host) && isLocal(request.Host) {
		return true
	}
	log.Printf("allowSameOrigin mismatch: parsed.Host=%q, request.Host=%q", parsed.Host, request.Host)
	writeJSON(writer, http.StatusForbidden, map[string]string{"error": "Cross-origin request blocked"})
	return false
}

func normalizeEmail(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	if len(email) > 254 {
		return "", errors.New("email is too long")
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return "", errors.New("invalid email")
	}
	return email, nil
}

func normalizedThemePreference(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "system":
		return "system", nil
	case "light":
		return "light", nil
	case "dark":
		return "dark", nil
	default:
		return "", errors.New("Invalid theme preference")
	}
}

func validatePassword(email string, password string) error {
	if len(password) < passwordMinLength {
		return fmt.Errorf("Password must be at least %d characters", passwordMinLength)
	}
	if len(password) > passwordMaxLength {
		return fmt.Errorf("Password must be at most %d characters", passwordMaxLength)
	}
	lowerPassword := strings.ToLower(password)
	localPart, _, _ := strings.Cut(email, "@")
	if localPart != "" && strings.Contains(lowerPassword, strings.ToLower(localPart)) {
		return errors.New("Password cannot contain your email")
	}
	if strings.Contains(lowerPassword, strings.ToLower(email)) {
		return errors.New("Password cannot contain your email")
	}
	for _, blocked := range []string{"password", "password123", "12345678", "qwerty123", "crackledate"} {
		if lowerPassword == blocked {
			return errors.New("Choose a less common password")
		}
	}
	return nil
}

func hashPassword(password string) (string, error) {
	salt, err := randomBytes(16)
	if err != nil {
		return "", err
	}
	memory := uint32(64 * 1024)
	iterations := uint32(3)
	parallelism := uint8(1)
	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, 32)
	return fmt.Sprintf(
		"argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		memory,
		iterations,
		parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func verifyPassword(password string, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false
	}
	var memory uint32
	var iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func randomBytes(length int) ([]byte, error) {
	value := make([]byte, length)
	_, err := rand.Read(value)
	return value, err
}

func randomCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func hashVerificationCode(userID int64, code string) string {
	sum := sha256.Sum256([]byte(strconv.FormatInt(userID, 10) + "\x00" + strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:])
}

func (user authUser) toResponse() authUserResponse {
	return authUserResponse{
		ID:            user.ID,
		Email:         user.Email,
		EmailVerified: user.EmailVerified,
	}
}
