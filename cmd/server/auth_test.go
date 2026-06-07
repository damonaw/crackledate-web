package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSignupRequiresMinimumPasswordLength(t *testing.T) {
	service := newTestAuthService(t)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{
		"email": "player@example.com",
		"password": "short",
		"themePreference": "dark",
		"difficultyMode": "hard"
	}`))
	response := httptest.NewRecorder()

	service.handleSignup(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d with body %s", response.Code, response.Body.String())
	}
}

func TestSignupAndCodeVerificationCreatesVerifiedSession(t *testing.T) {
	service := newTestAuthService(t)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{
		"email": "player@example.com",
		"password": "goodpass8",
		"themePreference": "dark",
		"difficultyMode": "hard"
	}`))
	response := httptest.NewRecorder()

	service.handleSignup(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d with body %s", response.Code, response.Body.String())
	}
	user := decodeAuthUser(t, response.Body)
	if user.Email != "player@example.com" || user.EmailVerified {
		t.Fatalf("unexpected signup user: %#v", user)
	}

	verifyRequest := httptest.NewRequest(http.MethodPost, "/api/auth/verify-code", strings.NewReader(`{
		"email": "player@example.com",
		"code": "123456"
	}`))
	verifyResponse := httptest.NewRecorder()

	service.handleVerifyCode(verifyResponse, verifyRequest)

	if verifyResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d with body %s", verifyResponse.Code, verifyResponse.Body.String())
	}
	verified := decodeAuthUser(t, verifyResponse.Body)
	if !verified.EmailVerified {
		t.Fatalf("expected verified user, got %#v", verified)
	}
	if verifyResponse.Result().Cookies()[0].Name != sessionCookieName {
		t.Fatalf("expected session cookie, got %#v", verifyResponse.Result().Cookies())
	}
}

func TestAuthenticatedSubmissionLinksAttemptAndSolution(t *testing.T) {
	path := filepath.Join(t.TempDir(), "submissions.db")
	store, err := newSubmissionStore(path)
	if err != nil {
		t.Fatalf("newSubmissionStore: %v", err)
	}
	t.Cleanup(store.close)
	service, err := newAuthService(store.db, emailConfig{}, func() time.Time {
		return time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("newAuthService: %v", err)
	}
	userID := createVerifiedUser(t, service, "player@example.com")
	session, err := service.createSession(userID)
	if err != nil {
		t.Fatalf("createSession: %v", err)
	}
	handler := handleSubmitSolution(store, service, func() time.Time {
		return time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	})
	request := httptest.NewRequest(http.MethodPost, "/api/submissions", strings.NewReader(`{
		"date": "2026-05-16",
		"equation": "5+√16=2^0+2+6",
		"seconds": 136,
		"difficulty": "easy",
		"platform": "web"
	}`))
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: session.token})
	response := httptest.NewRecorder()

	handler(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d with body %s", response.Code, response.Body.String())
	}
	var storedUserID int64
	if err := store.db.QueryRow(`SELECT user_id FROM submission_attempts`).Scan(&storedUserID); err != nil {
		t.Fatalf("query submission_attempts: %v", err)
	}
	if storedUserID != userID {
		t.Fatalf("stored user_id = %d, want %d", storedUserID, userID)
	}
	var solutionCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM user_solutions WHERE user_id = ?`, userID).Scan(&solutionCount); err != nil {
		t.Fatalf("query user_solutions: %v", err)
	}
	if solutionCount != 1 {
		t.Fatalf("solutionCount = %d", solutionCount)
	}
}

func newTestAuthService(t *testing.T) *authService {
	t.Helper()
	path := filepath.Join(t.TempDir(), "accounts.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	service, err := newAuthService(db, emailConfig{}, func() time.Time {
		return time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("newAuthService: %v", err)
	}
	service.code = func() (string, error) { return "123456", nil }
	return service
}

func decodeAuthUser(t *testing.T, body *bytes.Buffer) authUserResponse {
	t.Helper()
	var payload struct {
		User authUserResponse `json:"user"`
	}
	if err := json.Unmarshal(body.Bytes(), &payload); err != nil {
		t.Fatalf("decode auth response: %v\n%s", err, body.String())
	}
	return payload.User
}

func createVerifiedUser(t *testing.T, service *authService, email string) int64 {
	t.Helper()
	hash, err := hashPassword("goodpass8")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	now := service.now().UTC().Format(time.RFC3339)
	result, err := service.db.Exec(
		`INSERT INTO users (email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		email,
		hash,
		now,
		now,
		now,
	)
	if err != nil {
		t.Fatalf("insert verified user: %v", err)
	}
	userID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("LastInsertId: %v", err)
	}
	return userID
}
