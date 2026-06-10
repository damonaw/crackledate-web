package main

import (
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
)

const defaultSubmissionsPath = "data/submissions.ndjson"

type submitSolutionRequest struct {
	Date       string `json:"date"`
	Equation   string `json:"equation"`
	Seconds    *int   `json:"seconds,omitempty"`
	Difficulty string `json:"difficulty"`
	Platform   string `json:"platform"`
	AppVersion string `json:"appVersion,omitempty"`
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
}

type submissionStore struct {
	path string
	mu   sync.Mutex
}

func newSubmissionStore(path string) *submissionStore {
	return &submissionStore{path: path}
}

func submissionsPathFromEnvironment() string {
	if value := strings.TrimSpace(os.Getenv("SUBMISSIONS_PATH")); value != "" {
		return value
	}
	return defaultSubmissionsPath
}

func handleSubmitSolution(store *submissionStore, now func() time.Time) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var payload submitSolutionRequest
		decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 32*1024))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		record, err := submittedSolutionRecordFromRequest(payload, now)
		if err != nil {
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

	date, err := game.ParsePuzzleDate(payload.Date, submittedAt)
	if err != nil {
		return submittedSolutionRecord{}, errors.New("Invalid date")
	}

	equation := strings.TrimSpace(payload.Equation)
	if equation == "" {
		return submittedSolutionRecord{}, errors.New("Equation cannot be empty")
	}
	if len(equation) > 512 {
		return submittedSolutionRecord{}, errors.New("Equation is too long")
	}

	difficulty, err := normalizedDifficulty(payload.Difficulty)
	if err != nil {
		return submittedSolutionRecord{}, err
	}
	platform, err := normalizedPlatform(payload.Platform)
	if err != nil {
		return submittedSolutionRecord{}, err
	}
	appVersion := trimMax(payload.AppVersion, 64)

	if payload.Seconds != nil && (*payload.Seconds < 0 || *payload.Seconds > 24*60*60) {
		return submittedSolutionRecord{}, errors.New("Solve time is out of range")
	}

	puzzle := game.PuzzleForDate(date)
	validation := game.ValidateEquation(equation, puzzle.Digits)
	if !validation.Valid {
		return submittedSolutionRecord{}, errors.New(validation.ErrorMessage)
	}

	value := ""
	if validation.LeftValue != nil {
		value = *validation.LeftValue
	}

	return submittedSolutionRecord{
		SubmittedAt:      submittedAt.UTC().Format(time.RFC3339),
		PuzzleDate:       puzzle.DateIdentifier,
		Equation:         equation,
		Value:            value,
		SolveTimeSeconds: payload.Seconds,
		Difficulty:       difficulty,
		HardMode:         difficulty == "hard",
		Platform:         platform,
		AppVersion:       appVersion,
	}, nil
}

func (store *submissionStore) append(record submittedSolutionRecord) error {
	if store == nil {
		return fmt.Errorf("submission store is not configured")
	}
	store.mu.Lock()
	defer store.mu.Unlock()

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
