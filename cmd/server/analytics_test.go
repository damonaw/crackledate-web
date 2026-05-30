package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientAddressPrefersCloudflareHeader(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("CF-Connecting-IP", " 203.0.113.10 ")
	request.Header.Set("X-Forwarded-For", "198.51.100.7, 198.51.100.8")
	request.RemoteAddr = "192.0.2.44:443"

	address, source := clientAddress(request)

	if address != "203.0.113.10" {
		t.Fatalf("expected Cloudflare visitor IP, got %q", address)
	}
	if source != "cf-connecting-ip" {
		t.Fatalf("expected cf-connecting-ip source, got %q", source)
	}
}

func TestClientHashesRotateWithoutExposingRawIP(t *testing.T) {
	clientIP := "203.0.113.10"
	secret := "test-secret"
	monday := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	tuesday := monday.AddDate(0, 0, 1)
	nextWeek := monday.AddDate(0, 0, 7)

	mondayHashes := clientHashes(clientIP, secret, monday)
	tuesdayHashes := clientHashes(clientIP, secret, tuesday)
	nextWeekHashes := clientHashes(clientIP, secret, nextWeek)

	if mondayHashes.Day == "" || mondayHashes.Week == "" {
		t.Fatal("expected non-empty hashes")
	}
	if mondayHashes.Day == clientIP || mondayHashes.Week == clientIP {
		t.Fatal("client hash exposed raw IP")
	}
	if mondayHashes.Day == tuesdayHashes.Day {
		t.Fatal("daily hash should rotate")
	}
	if mondayHashes.Week != tuesdayHashes.Week {
		t.Fatal("weekly hash should stay stable within a week")
	}
	if mondayHashes.Week == nextWeekHashes.Week {
		t.Fatal("weekly hash should rotate between weeks")
	}
}

func TestRequestLoggerWritesHashedClientFields(t *testing.T) {
	var output bytes.Buffer
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	analytics := analyticsConfig{
		hashSecret: "test-secret",
		now:        func() time.Time { return now },
		output:     &output,
	}
	handler := requestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}), analytics)

	request := httptest.NewRequest(http.MethodGet, "/api/puzzle?date=2026-05-29", nil)
	request.Header.Set("CF-Connecting-IP", "203.0.113.10")
	request.Header.Set("CF-IPCountry", "US")
	request.Header.Set("CF-Ray", "abc123-DEN")
	request.Header.Set("User-Agent", "analytics-test")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatalf("failed to decode request log: %v\n%s", err, output.String())
	}

	expectedHashes := clientHashes("203.0.113.10", "test-secret", now)
	if entry["clientDay"] != expectedHashes.Day {
		t.Fatalf("expected daily client hash %q, got %v", expectedHashes.Day, entry["clientDay"])
	}
	if entry["clientWeek"] != expectedHashes.Week {
		t.Fatalf("expected weekly client hash %q, got %v", expectedHashes.Week, entry["clientWeek"])
	}
	if entry["status"] != float64(http.StatusCreated) {
		t.Fatalf("expected status in log, got %v", entry["status"])
	}
	if entry["clientSource"] != "cf-connecting-ip" || entry["country"] != "US" || entry["cfRay"] != "abc123-DEN" {
		t.Fatalf("expected Cloudflare fields, got %#v", entry)
	}
	if bytes.Contains(output.Bytes(), []byte("203.0.113.10")) {
		t.Fatalf("log exposed raw client IP: %s", output.String())
	}
}
