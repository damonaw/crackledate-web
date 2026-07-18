package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestHandleHintRejectsNonGET(t *testing.T) {
	var solverCalls atomic.Int32
	handler := newHintHandler(func([]int, string, string, string) (string, error) {
		solverCalls.Add(1)
		return "6=6", nil
	}, 1)

	request := newHintRequest(http.MethodPost, "date=2026-06-19")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405; body %s", response.Code, response.Body.String())
	}
	if solverCalls.Load() != 0 {
		t.Fatalf("solver calls = %d, want 0", solverCalls.Load())
	}
}

func TestHandleHintRejectsEachOversizedOrMalformedQueryBeforeSolve(t *testing.T) {
	tests := []struct {
		name     string
		rawQuery string
	}{
		{name: "raw query", rawQuery: strings.Repeat("x", 1025)},
		{name: "date", rawQuery: "date=" + strings.Repeat("2", 33)},
		{name: "mode", rawQuery: "date=2026-06-19&mode=" + strings.Repeat("m", 33)},
		{name: "target value", rawQuery: "date=2026-06-19&targetValue=" + strings.Repeat("1", 65)},
		{name: "decoded prefix", rawQuery: "date=2026-06-19&prefix=" + strings.Repeat("a", 257)},
		{name: "malformed encoding", rawQuery: "date=2026-06-19&prefix=%zz"},
		{name: "encoded prefix bypass", rawQuery: "date=2026-06-19&prefix=" + strings.Repeat("%41", 257)},
		{name: "duplicate field bypass", rawQuery: "date=2026-06-19&prefix=1&prefix=" + strings.Repeat("a", 257)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var solverCalls atomic.Int32
			handler := newHintHandler(func([]int, string, string, string) (string, error) {
				solverCalls.Add(1)
				return "6=6", nil
			}, 1)
			request := newHintRequest(http.MethodGet, test.rawQuery)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", response.Code, response.Body.String())
			}
			if solverCalls.Load() != 0 {
				t.Fatalf("solver calls = %d, want 0", solverCalls.Load())
			}
		})
	}
}

func TestHandleHintAcceptsExactQueryBoundaries(t *testing.T) {
	baseRawQuery := "date=2026-06-19&padding="
	tests := []struct {
		name     string
		rawQuery string
	}{
		{name: "raw query", rawQuery: baseRawQuery + strings.Repeat("x", 1024-len(baseRawQuery))},
		{name: "mode", rawQuery: "date=2026-06-19&mode=" + strings.Repeat("m", 32)},
		{name: "target value", rawQuery: "date=2026-06-19&targetValue=" + strings.Repeat("1", 64)},
		{name: "prefix", rawQuery: "date=2026-06-19&prefix=" + strings.Repeat("a", 256)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var solverCalls atomic.Int32
			handler := newHintHandler(func([]int, string, string, string) (string, error) {
				solverCalls.Add(1)
				return "6=6", nil
			}, 1)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, newHintRequest(http.MethodGet, test.rawQuery))

			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body %s", response.Code, response.Body.String())
			}
			if solverCalls.Load() != 1 {
				t.Fatalf("solver calls = %d, want 1", solverCalls.Load())
			}
		})
	}
}

func TestHandleHintReturnsValidJSONForValidQuery(t *testing.T) {
	var solverCalls atomic.Int32
	handler := newHintHandler(func(digits []int, mode string, targetValue string, prefix string) (string, error) {
		solverCalls.Add(1)
		if len(digits) == 0 || mode != "classic" || targetValue != "" || prefix != "6=" {
			t.Fatalf("solver args = %#v/%q/%q/%q", digits, mode, targetValue, prefix)
		}
		return "6=6", nil
	}, 1)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, newHintRequest(http.MethodGet, "date=2026-06-19&mode=classic&prefix=6%3D"))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("Content-Type = %q", response.Header().Get("Content-Type"))
	}
	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["solution"] != "6=6" || payload["step3"] != "6=6" {
		t.Fatalf("response payload = %#v", payload)
	}
	if solverCalls.Load() != 1 {
		t.Fatalf("solver calls = %d, want 1", solverCalls.Load())
	}
}

func TestHandleHintReturns404ForGenuineNoSolution(t *testing.T) {
	var solverCalls atomic.Int32
	handler := newHintHandler(func([]int, string, string, string) (string, error) {
		solverCalls.Add(1)
		return "", errors.New("no solution found")
	}, 1)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, newHintRequest(http.MethodGet, "date=2026-06-19&mode=classic"))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body %s", response.Code, response.Body.String())
	}
	if solverCalls.Load() != 1 {
		t.Fatalf("solver calls = %d, want 1", solverCalls.Load())
	}
}

func TestHandleHintLimitsConcurrentSolverWork(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var solverCalls atomic.Int32
	handler := newHintHandler(func([]int, string, string, string) (string, error) {
		if solverCalls.Add(1) == 1 {
			close(started)
		}
		<-release
		return "6=6", nil
	}, 1)

	firstResponse := httptest.NewRecorder()
	firstDone := make(chan struct{})
	go func() {
		defer close(firstDone)
		handler.ServeHTTP(firstResponse, newHintRequest(http.MethodGet, "date=2026-06-19"))
	}()

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("first solver did not start")
	}

	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, newHintRequest(http.MethodGet, "date=2026-06-19"))
	if secondResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("second status = %d, want 503; body %s", secondResponse.Code, secondResponse.Body.String())
	}
	if secondResponse.Header().Get("Retry-After") != "1" {
		t.Fatalf("Retry-After = %q, want 1", secondResponse.Header().Get("Retry-After"))
	}
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

func TestHandleHintReleasesSolveSlotAfterCompletion(t *testing.T) {
	var solverCalls atomic.Int32
	handler := newHintHandler(func([]int, string, string, string) (string, error) {
		if solverCalls.Add(1) == 1 {
			return "", errors.New("no solution")
		}
		return "6=6", nil
	}, 1)

	firstResponse := httptest.NewRecorder()
	handler.ServeHTTP(firstResponse, newHintRequest(http.MethodGet, "date=2026-06-19"))
	if firstResponse.Code != http.StatusNotFound {
		t.Fatalf("first status = %d, want 404", firstResponse.Code)
	}

	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, newHintRequest(http.MethodGet, "date=2026-06-19"))
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("second status = %d, want 200; body %s", secondResponse.Code, secondResponse.Body.String())
	}
	if solverCalls.Load() != 2 {
		t.Fatalf("solver calls = %d, want 2", solverCalls.Load())
	}
}

func newHintRequest(method string, rawQuery string) *http.Request {
	request := httptest.NewRequest(method, "/api/hint", nil)
	request.URL.RawQuery = rawQuery
	return request
}
