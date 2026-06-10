package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHandleSubmitSolutionStoresValidatedAnonymousPayload(t *testing.T) {
	submissionsPath := filepath.Join(t.TempDir(), "submissions.ndjson")
	store := newSubmissionStore(submissionsPath)
	now := time.Date(2026, 5, 30, 14, 15, 16, 0, time.UTC)
	handler := handleSubmitSolution(store, func() time.Time { return now })

	body := strings.NewReader(`{
		"date": "2026-05-16",
		"equation": "5+√16=2^0+2+6",
		"seconds": 136,
		"difficulty": "easy",
		"platform": "web",
		"appVersion": "0.1.0"
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/submissions", body)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("CF-Connecting-IP", "203.0.113.10")
	request.Header.Set("User-Agent", "submission-test")
	response := httptest.NewRecorder()

	handler(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d with body %s", response.Code, response.Body.String())
	}

	file := readSingleSubmissionLine(t, submissionsPath)
	if bytes.Contains(file, []byte("203.0.113.10")) || bytes.Contains(file, []byte("submission-test")) {
		t.Fatalf("submission stored request identity data: %s", string(file))
	}

	var record submittedSolutionRecord
	if err := json.Unmarshal(file, &record); err != nil {
		t.Fatalf("failed to decode stored submission: %v\n%s", err, string(file))
	}
	if record.SubmittedAt != "2026-05-30T14:15:16Z" {
		t.Fatalf("SubmittedAt = %q", record.SubmittedAt)
	}
	if record.PuzzleDate != "2026-05-16" || record.Equation != "5+√16=2^0+2+6" {
		t.Fatalf("stored wrong puzzle/equation: %#v", record)
	}
	if record.Value != "9" {
		t.Fatalf("Value = %q", record.Value)
	}
	if record.SolveTimeSeconds == nil || *record.SolveTimeSeconds != 136 {
		t.Fatalf("SolveTimeSeconds = %#v", record.SolveTimeSeconds)
	}
	if record.Difficulty != "easy" || record.HardMode {
		t.Fatalf("difficulty/hard mode = %q/%v", record.Difficulty, record.HardMode)
	}
	if record.Platform != "web" || record.AppVersion != "0.1.0" {
		t.Fatalf("platform/version = %q/%q", record.Platform, record.AppVersion)
	}
}

func TestHandleSubmitSolutionAcceptsAndroidPlatform(t *testing.T) {
	submissionsPath := filepath.Join(t.TempDir(), "submissions.ndjson")
	store := newSubmissionStore(submissionsPath)
	handler := handleSubmitSolution(store, func() time.Time {
		return time.Date(2026, 5, 30, 14, 15, 16, 0, time.UTC)
	})

	body := strings.NewReader(`{
		"date": "2026-05-16",
		"equation": "5+√16=2^0+2+6",
		"seconds": 136,
		"difficulty": "hard",
		"platform": "android",
		"appVersion": "1.0.0"
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/submissions", body)
	response := httptest.NewRecorder()

	handler(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d with body %s", response.Code, response.Body.String())
	}

	var record submittedSolutionRecord
	if err := json.Unmarshal(readSingleSubmissionLine(t, submissionsPath), &record); err != nil {
		t.Fatalf("failed to decode stored submission: %v", err)
	}
	if record.Platform != "android" {
		t.Fatalf("Platform = %q", record.Platform)
	}
}

func TestHandleSubmitSolutionRejectsInvalidEquationWithoutStoring(t *testing.T) {
	submissionsPath := filepath.Join(t.TempDir(), "submissions.ndjson")
	store := newSubmissionStore(submissionsPath)
	handler := handleSubmitSolution(store, func() time.Time { return time.Date(2026, 5, 30, 0, 0, 0, 0, time.UTC) })

	body := strings.NewReader(`{
		"date": "2026-05-16",
		"equation": "5+1+6=2+0+2+6",
		"seconds": 12,
		"difficulty": "hard",
		"platform": "web"
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/submissions", body)
	response := httptest.NewRecorder()

	handler(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d with body %s", response.Code, response.Body.String())
	}
	if lines := readSubmissionLines(t, submissionsPath); len(lines) != 0 {
		t.Fatalf("expected no stored submissions, got %q", lines)
	}
}

func readSingleSubmissionLine(t *testing.T, path string) []byte {
	t.Helper()
	lines := readSubmissionLines(t, path)
	if len(lines) != 1 {
		t.Fatalf("expected one submission line, got %d: %q", len(lines), lines)
	}
	return lines[0]
}

func readSubmissionLines(t *testing.T, path string) [][]byte {
	t.Helper()
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatalf("failed to open submissions: %v", err)
	}
	defer file.Close()

	var lines [][]byte
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, append([]byte(nil), scanner.Bytes()...))
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("failed to scan submissions: %v", err)
	}
	return lines
}
