package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"crackledate-web/internal/game"
	_ "modernc.org/sqlite"
)

const defaultSubmissionsPath = "data/submissions.db"

type submitSolutionRequest struct {
	Date                  string `json:"date"`
	Equation              string `json:"equation"`
	Seconds               *int   `json:"seconds,omitempty"`
	Difficulty            string `json:"difficulty"`
	Platform              string `json:"platform"`
	AppVersion            string `json:"appVersion,omitempty"`
	ClientRejectionReason string `json:"clientRejectionReason,omitempty"`
}

type submittedSolutionRecord struct {
	SubmittedAt      string `json:"submittedAt"`
	PuzzleDate       string `json:"puzzleDate"`
	Equation         string `json:"equation"`
	Value            string `json:"value"`
	SolveTimeSeconds *int   `json:"solveTimeSeconds,omitempty"`
	Difficulty       string `json:"difficulty"`
	HardMode         bool   `json:"hardMode"`
	Platform         string `json:"platform"`
	AppVersion       string `json:"appVersion,omitempty"`
	SubmissionStatus string `json:"submissionStatus"`
	RejectionReason  string `json:"rejectionReason,omitempty"`
	UserID           *int64 `json:"userId,omitempty"`
}

type submissionStore struct {
	path string
	db   *sql.DB
	mu   sync.Mutex
}

const acceptedSubmission = "accepted"
const rejectedSubmission = "rejected"
const duplicateSolutionReason = "Solution already saved for this date."

func newSubmissionStore(path string) (*submissionStore, error) {
	store := &submissionStore{path: path}
	if !isDatabasePath(store.path) {
		return store, nil
	}

	if err := os.MkdirAll(filepath.Dir(store.path), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", store.path)
	if err != nil {
		return nil, fmt.Errorf("open submissions database: %w", err)
	}
	db.SetMaxOpenConns(1)
	store.db = db

	const createTable = `
	CREATE TABLE IF NOT EXISTS submission_attempts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		submitted_at TEXT NOT NULL,
		puzzle_date TEXT NOT NULL,
		equation TEXT NOT NULL,
		value TEXT NOT NULL,
		solve_time_seconds INTEGER,
		difficulty TEXT NOT NULL,
		hard_mode INTEGER NOT NULL,
		platform TEXT NOT NULL,
		app_version TEXT,
		submission_status TEXT NOT NULL,
		rejection_reason TEXT,
		user_id INTEGER
	);
	`
	if _, err := store.db.Exec(createTable); err != nil {
		return nil, fmt.Errorf("create submissions table: %w", err)
	}
	if err := addSQLiteColumnIfMissing(store.db, "submission_attempts", "user_id", "INTEGER"); err != nil {
		return nil, fmt.Errorf("migrate submissions table: %w", err)
	}
	const createIndexes = `
	CREATE INDEX IF NOT EXISTS submission_attempts_submitted_at_idx ON submission_attempts (submitted_at);
	CREATE INDEX IF NOT EXISTS submission_attempts_puzzle_status_idx ON submission_attempts (puzzle_date, submission_status);
	CREATE INDEX IF NOT EXISTS submission_attempts_user_id_idx ON submission_attempts (user_id);
	`
	if _, err := store.db.Exec(createIndexes); err != nil {
		return nil, fmt.Errorf("create submissions indexes: %w", err)
	}

	return store, nil
}

func submissionsPathFromEnvironment() string {
	if value := strings.TrimSpace(os.Getenv("SUBMISSIONS_PATH")); value != "" {
		return value
	}
	return defaultSubmissionsPath
}

func handleSubmitSolution(store *submissionStore, auth *authService, now func() time.Time) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		user := auth.currentVerifiedUser(request)

		var payload submitSolutionRequest
		if err := decodeJSONBody(writer, request, &payload); err != nil {
			record := rejectedSubmissionRecord("Invalid request body", now)
			if user != nil {
				record.UserID = &user.ID
			}
			if appendErr := store.append(record); appendErr != nil {
				logServerError("store submission attempt", appendErr)
				writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not save submission"})
				return
			}
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		record, err := submittedSolutionRecordFromRequest(payload, now)
		if user != nil {
			record.UserID = &user.ID
		}
		if err != nil {
			if appendErr := store.append(record); appendErr != nil {
				logServerError("store submission attempt", appendErr)
				writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not save submission"})
				return
			}
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		if err := store.append(record); err != nil {
			logServerError("store submission", err)
			writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Could not save submission"})
			return
		}

		writeJSON(writer, http.StatusCreated, map[string]bool{"saved": true})
	}
}

func submittedSolutionRecordFromRequest(payload submitSolutionRequest, now func() time.Time) (submittedSolutionRecord, error) {
	submittedAt := time.Now()
	if now != nil {
		submittedAt = now()
	}

	equation := strings.TrimSpace(payload.Equation)
	dateIdentifier := strings.TrimSpace(payload.Date)

	record := submittedSolutionRecord{
		SubmittedAt: submittedAt.UTC().Format(time.RFC3339),
		PuzzleDate:  dateIdentifier,
		Equation:    equation,
		Difficulty:  "",
		Platform:    "",
		AppVersion:  trimMax(payload.AppVersion, 64),
	}

	difficulty, err := normalizedDifficulty(payload.Difficulty)
	if err != nil {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = err.Error()
		return record, err
	}
	platform, err := normalizedPlatform(payload.Platform)
	if err != nil {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = err.Error()
		return record, err
	}
	record.Difficulty = difficulty
	record.HardMode = difficulty == "hard"
	record.Platform = platform

	if payload.Seconds != nil && (*payload.Seconds < 0 || *payload.Seconds > 24*60*60) {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = "Solve time is out of range"
		record.SolveTimeSeconds = payload.Seconds
		return record, errors.New(record.RejectionReason)
	}

	record.SolveTimeSeconds = payload.Seconds

	date, err := game.ParsePuzzleDate(payload.Date, submittedAt)
	if err != nil {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = "Invalid date"
		return record, errors.New(record.RejectionReason)
	}
	record.PuzzleDate = date.Format("2006-01-02")

	if equation == "" {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = "Equation cannot be empty"
		return record, errors.New(record.RejectionReason)
	}
	if len(equation) > 512 {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = "Equation is too long"
		return record, errors.New(record.RejectionReason)
	}

	puzzle := game.PuzzleForDate(date)
	validation := game.ValidateEquation(equation, puzzle.Digits)
	if !validation.Valid {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = validation.ErrorMessage
		return record, errors.New(validation.ErrorMessage)
	}

	value := ""
	if validation.LeftValue != nil {
		value = *validation.LeftValue
	}

	record.Value = value
	if reason, ok := normalizedClientRejectionReason(payload.ClientRejectionReason); ok {
		record.SubmissionStatus = rejectedSubmission
		record.RejectionReason = reason
		return record, errors.New(reason)
	}

	record.SubmissionStatus = acceptedSubmission
	return record, nil
}

func rejectedSubmissionRecord(reason string, now func() time.Time) submittedSolutionRecord {
	submittedAt := time.Now()
	if now != nil {
		submittedAt = now()
	}

	return submittedSolutionRecord{
		SubmittedAt:      submittedAt.UTC().Format(time.RFC3339),
		SubmissionStatus: rejectedSubmission,
		RejectionReason:  reason,
	}
}

func isDatabasePath(path string) bool {
	path = strings.ToLower(strings.TrimSpace(path))
	return strings.HasSuffix(path, ".db") || strings.HasSuffix(path, ".sqlite") || strings.HasSuffix(path, ".sqlite3")
}

func addSQLiteColumnIfMissing(db *sql.DB, table string, column string, definition string) error {
	_, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	if err == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return nil
	}
	return err
}

func normalizedClientRejectionReason(value string) (string, bool) {
	switch strings.TrimSpace(value) {
	case duplicateSolutionReason:
		return duplicateSolutionReason, true
	default:
		return "", false
	}
}

func (store *submissionStore) append(record submittedSolutionRecord) error {
	if store == nil {
		return fmt.Errorf("submission store is not configured")
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	if store.db != nil {
		return store.appendToDatabase(record)
	}
	return store.appendToFile(record)
}

func (store *submissionStore) appendToDatabase(record submittedSolutionRecord) error {
	const insert = `
	INSERT INTO submission_attempts (
		submitted_at,
		puzzle_date,
		equation,
		value,
		solve_time_seconds,
		difficulty,
		hard_mode,
		platform,
		app_version,
		submission_status,
		rejection_reason,
		user_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := store.db.Exec(
		insert,
		record.SubmittedAt,
		record.PuzzleDate,
		record.Equation,
		record.Value,
		record.SolveTimeSeconds,
		record.Difficulty,
		record.HardMode,
		record.Platform,
		record.AppVersion,
		record.SubmissionStatus,
		record.RejectionReason,
		record.UserID,
	)
	if err != nil {
		return err
	}
	if record.UserID != nil && record.SubmissionStatus == acceptedSubmission {
		seconds := 0
		if record.SolveTimeSeconds != nil {
			seconds = *record.SolveTimeSeconds
		}
		_, err = insertUserSolution(store.db, *record.UserID, record.PuzzleDate, record.Equation, record.Value, seconds, record.SubmittedAt, "submission")
	}
	return err
}

func (store *submissionStore) appendToFile(record submittedSolutionRecord) error {
	if err := os.MkdirAll(filepath.Dir(store.path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(store.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	return encoder.Encode(record)
}

func (store *submissionStore) close() {
	if store == nil || store.db == nil {
		return
	}
	_ = store.db.Close()
}

func normalizedDifficulty(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "easy":
		return "easy", nil
	case "hard":
		return "hard", nil
	default:
		return "", errors.New("Invalid difficulty")
	}
}

func normalizedPlatform(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "web":
		return "web", nil
	case "ios":
		return "ios", nil
	case "android":
		return "android", nil
	default:
		return "", errors.New("Invalid platform")
	}
}

func trimMax(value string, maximum int) string {
	value = strings.TrimSpace(value)
	if len(value) <= maximum {
		return value
	}
	return value[:maximum]
}

func logServerError(context string, err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	}
}
