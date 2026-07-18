package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"crackledate-web/internal/game"
)

func TestHandleHintAcceptsBoundedPOSTAndReturnsNoStoreJSON(t *testing.T) {
	budget := game.DefaultSearchBudget
	var solverCalls atomic.Int32
	handler := newHintHandler(func(
		ctx context.Context,
		digits []int,
		mode string,
		targetValue string,
		prefix string,
		actualBudget game.SearchBudget,
	) (game.Hint, game.SearchStats, error) {
		solverCalls.Add(1)
		if ctx == nil || len(digits) == 0 || mode != "classic" || targetValue != "" || prefix != "6=" {
			t.Fatalf("solver args = %#v/%q/%q/%q", digits, mode, targetValue, prefix)
		}
		if actualBudget != budget {
			t.Fatalf("budget = %#v, want %#v", actualBudget, budget)
		}
		return game.Hint{Solution: "6=6", Step1: "6", Step2: "6", Step3: "6=6"}, game.SearchStats{CandidateConstructions: 7}, nil
	}, 1, budget)
	response := httptest.NewRecorder()
	request := newHintPOST(`{"date":"2026-06-19","mode":"classic","prefix":"6="}`)
	request.URL.RawQuery = "prefix=must-not-be-read&targetValue=must-not-be-read"

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", response.Code, response.Body.String())
	}
	assertNoStoreJSON(t, response)
	var payload game.Hint
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Solution != "6=6" || payload.Step1 != "6" || payload.Step2 != "6" || payload.Step3 != "6=6" {
		t.Fatalf("response payload = %#v", payload)
	}
	if solverCalls.Load() != 1 {
		t.Fatalf("solver calls = %d, want 1", solverCalls.Load())
	}
}

func TestHandleHintRejectsGETBeforeSolve(t *testing.T) {
	var solverCalls atomic.Int32
	handler := newHintHandler(countingHintSolver(&solverCalls), 1, game.DefaultSearchBudget)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/hint?prefix=secret", nil))

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405; body %s", response.Code, response.Body.String())
	}
	if solverCalls.Load() != 0 {
		t.Fatalf("solver calls = %d, want 0", solverCalls.Load())
	}
}

func TestHandleHintRejectsMalformedUnknownTrailingAndOversizedJSONBeforeSolve(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "empty", body: ""},
		{name: "malformed", body: `{"date":`},
		{name: "unknown field", body: `{"date":"2026-06-19","mode":"classic","prefix":"","unexpected":true}`},
		{name: "trailing JSON", body: `{"date":"2026-06-19","mode":"classic","prefix":""}{}`},
		{name: "oversized", body: `{"date":"2026-06-19","mode":"classic","prefix":"","padding":"` + strings.Repeat("x", int(maxAPIJSONBodyBytes)) + `"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var solverCalls atomic.Int32
			handler := newHintHandler(countingHintSolver(&solverCalls), 1, game.DefaultSearchBudget)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, newHintPOST(test.body))

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", response.Code, response.Body.String())
			}
			assertNoStoreJSON(t, response)
			if solverCalls.Load() != 0 {
				t.Fatalf("solver calls = %d, want 0", solverCalls.Load())
			}
		})
	}
}

func TestHandleHintRejectsInvalidDecodedFieldsBeforeSolve(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "date too long", body: `{"date":"` + strings.Repeat("2", 33) + `","mode":"classic","prefix":""}`},
		{name: "mode too long", body: `{"date":"2026-06-19","mode":"` + strings.Repeat("m", 33) + `","prefix":""}`},
		{name: "prefix too long", body: `{"date":"2026-06-19","mode":"classic","prefix":"` + strings.Repeat("p", 257) + `"}`},
		{name: "multibyte prefix too long", body: `{"date":"2026-06-19","mode":"classic","prefix":"` + strings.Repeat("é", 129) + `"}`},
		{name: "target too long", body: `{"date":"2026-06-19","mode":"classic","prefix":"","targetValue":"` + strings.Repeat("1", 65) + `"}`},
		{name: "invalid date", body: `{"date":"not-a-date","mode":"classic","prefix":""}`},
		{name: "non-classic mode", body: `{"date":"2026-06-19","mode":"target","prefix":"","targetValue":"6"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var solverCalls atomic.Int32
			handler := newHintHandler(countingHintSolver(&solverCalls), 1, game.DefaultSearchBudget)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, newHintPOST(test.body))

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", response.Code, response.Body.String())
			}
			if solverCalls.Load() != 0 {
				t.Fatalf("solver calls = %d, want 0", solverCalls.Load())
			}
		})
	}
}

func TestHandleHintDoesNotWriteAfterRequestCancellation(t *testing.T) {
	started := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	handler := newHintHandler(func(
		solverContext context.Context,
		_ []int,
		_ string,
		_ string,
		_ string,
		_ game.SearchBudget,
	) (game.Hint, game.SearchStats, error) {
		close(started)
		<-solverContext.Done()
		return game.Hint{}, game.SearchStats{}, solverContext.Err()
	}, 1, game.DefaultSearchBudget)
	writer := newTrackingResponseWriter()
	request := newHintPOST(`{"date":"2026-06-19","mode":"classic","prefix":""}`).WithContext(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		handler.ServeHTTP(writer, request)
	}()

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("solver did not start")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("cancelled request did not return")
	}
	if writer.writeCalls.Load() != 0 {
		t.Fatalf("response writes = %d, want 0", writer.writeCalls.Load())
	}
}

func TestHandleHintLimitsConcurrentSolverWork(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var solverCalls atomic.Int32
	handler := newHintHandler(func(
		_ context.Context,
		_ []int,
		_ string,
		_ string,
		_ string,
		_ game.SearchBudget,
	) (game.Hint, game.SearchStats, error) {
		if solverCalls.Add(1) == 1 {
			close(started)
		}
		<-release
		return game.Hint{Solution: "6=6", Step1: "6", Step2: "6", Step3: "6=6"}, game.SearchStats{}, nil
	}, 1, game.DefaultSearchBudget)

	firstResponse := httptest.NewRecorder()
	firstDone := make(chan struct{})
	go func() {
		defer close(firstDone)
		handler.ServeHTTP(firstResponse, newHintPOST(`{"date":"2026-06-19","mode":"classic","prefix":""}`))
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("first solver did not start")
	}

	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, newHintPOST(`{"date":"2026-06-19","mode":"classic","prefix":""}`))
	if secondResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("second status = %d, want 503; body %s", secondResponse.Code, secondResponse.Body.String())
	}
	if secondResponse.Header().Get("Retry-After") != "1" {
		t.Fatalf("Retry-After = %q, want 1", secondResponse.Header().Get("Retry-After"))
	}
	assertNoStoreJSON(t, secondResponse)
	if solverCalls.Load() != 1 {
		t.Fatalf("solver calls = %d, want 1", solverCalls.Load())
	}

	close(release)
	select {
	case <-firstDone:
	case <-time.After(5 * time.Second):
		t.Fatal("first request did not finish")
	}
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", firstResponse.Code)
	}
}

func TestHandleHintMapsSolverErrors(t *testing.T) {
	tests := []struct {
		name       string
		solverErr  error
		wantStatus int
	}{
		{name: "no solution", solverErr: game.ErrNoSolution, wantStatus: http.StatusNotFound},
		{name: "budget", solverErr: game.ErrSearchBudgetExceeded, wantStatus: http.StatusServiceUnavailable},
		{name: "deadline", solverErr: context.DeadlineExceeded, wantStatus: http.StatusServiceUnavailable},
		{name: "unexpected", solverErr: errors.New("unexpected"), wantStatus: http.StatusInternalServerError},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newHintHandler(func(
				context.Context,
				[]int,
				string,
				string,
				string,
				game.SearchBudget,
			) (game.Hint, game.SearchStats, error) {
				return game.Hint{}, game.SearchStats{}, test.solverErr
			}, 1, game.DefaultSearchBudget)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, newHintPOST(`{"date":"2026-06-19","mode":"classic","prefix":""}`))

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body %s", response.Code, test.wantStatus, response.Body.String())
			}
			assertNoStoreJSON(t, response)
		})
	}
}

func countingHintSolver(calls *atomic.Int32) hintSolver {
	return func(
		context.Context,
		[]int,
		string,
		string,
		string,
		game.SearchBudget,
	) (game.Hint, game.SearchStats, error) {
		calls.Add(1)
		return game.Hint{}, game.SearchStats{}, nil
	}
}

func newHintPOST(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/api/hint", strings.NewReader(body))
}

func assertNoStoreJSON(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", response.Header().Get("Content-Type"))
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", response.Header().Get("Cache-Control"))
	}
}

type trackingResponseWriter struct {
	header     http.Header
	writeCalls atomic.Int32
}

func newTrackingResponseWriter() *trackingResponseWriter {
	return &trackingResponseWriter{header: make(http.Header)}
}

func (writer *trackingResponseWriter) Header() http.Header {
	return writer.header
}

func (writer *trackingResponseWriter) WriteHeader(int) {
	writer.writeCalls.Add(1)
}

func (writer *trackingResponseWriter) Write(body []byte) (int, error) {
	writer.writeCalls.Add(1)
	return len(body), nil
}
