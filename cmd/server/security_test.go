package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleValidateRejectsOversizedBody(t *testing.T) {
	body := `{"date":"2026-05-16","equation":"` + strings.Repeat("1", int(maxAPIJSONBodyBytes)) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/validate", strings.NewReader(body))
	response := httptest.NewRecorder()

	handleValidate(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d with body %s", response.Code, response.Body.String())
	}
}

func TestHandleEvaluateRejectsUnknownFields(t *testing.T) {
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/evaluate",
		strings.NewReader(`{"date":"2026-05-16","equation":"1+1","unexpected":"field"}`),
	)
	response := httptest.NewRecorder()

	handleEvaluate(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d with body %s", response.Code, response.Body.String())
	}
}

func TestRateLimitAPIRejectsBurstAndResetsAfterWindow(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	config := rateLimitConfig{
		window: time.Minute,
		limits: map[string]int{
			"/api/validate": 2,
		},
		now: func() time.Time { return now },
	}
	handled := 0
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		handled++
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	first := rateLimitedRequest(handler, "/api/validate", "203.0.113.10:1234")
	second := rateLimitedRequest(handler, "/api/validate", "203.0.113.10:1234")
	third := rateLimitedRequest(handler, "/api/validate", "203.0.113.10:1234")

	if first.Code != http.StatusNoContent || second.Code != http.StatusNoContent {
		t.Fatalf("expected first two requests through, got %d/%d", first.Code, second.Code)
	}
	if third.Code != http.StatusTooManyRequests {
		t.Fatalf("expected third request to be rate limited, got %d", third.Code)
	}
	if third.Header().Get("Retry-After") != "60" {
		t.Fatalf("Retry-After = %q", third.Header().Get("Retry-After"))
	}
	if handled != 2 {
		t.Fatalf("handled requests = %d", handled)
	}

	now = now.Add(time.Minute)
	fourth := rateLimitedRequest(handler, "/api/validate", "203.0.113.10:1234")

	if fourth.Code != http.StatusNoContent {
		t.Fatalf("expected request after window reset through, got %d", fourth.Code)
	}
	if handled != 3 {
		t.Fatalf("handled requests after reset = %d", handled)
	}
}

func TestRateLimitAPISeparatesClientsAndPaths(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	config := rateLimitConfig{
		window: time.Minute,
		limits: map[string]int{
			"/api/submissions": 1,
		},
		now: func() time.Time { return now },
	}
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	_ = rateLimitedRequest(handler, "/api/submissions", "203.0.113.10:1234")
	sameClient := rateLimitedRequest(handler, "/api/submissions", "203.0.113.10:1234")
	otherClient := rateLimitedRequest(handler, "/api/submissions", "203.0.113.11:1234")
	otherPath := rateLimitedRequest(handler, "/api/health", "203.0.113.10:1234")

	if sameClient.Code != http.StatusTooManyRequests {
		t.Fatalf("expected same client to be rate limited, got %d", sameClient.Code)
	}
	if otherClient.Code != http.StatusNoContent {
		t.Fatalf("expected other client through, got %d", otherClient.Code)
	}
	if otherPath.Code != http.StatusNoContent {
		t.Fatalf("expected unlisted path through, got %d", otherPath.Code)
	}
}

func rateLimitedRequest(handler http.Handler, path string, remoteAddr string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, path, nil)
	request.RemoteAddr = remoteAddr
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
