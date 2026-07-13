package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExpireLegacySessionCookieCoversAPIAndStaticPaths(t *testing.T) {
	for _, requestPath := range []string{"/api/health", "/assets/app.js"} {
		t.Run(requestPath, func(t *testing.T) {
			seenPath := ""
			handler := expireLegacySessionCookie(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				seenPath = request.URL.Path
				writer.Header().Set("X-Downstream", "preserved")
				writer.WriteHeader(http.StatusCreated)
				_, _ = writer.Write([]byte("downstream body"))
			}))

			request := httptest.NewRequest(http.MethodGet, requestPath, nil)
			request.AddCookie(&http.Cookie{Name: "crackledate_session", Value: "retired-value"})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if seenPath != requestPath {
				t.Fatalf("downstream path = %q, want %q", seenPath, requestPath)
			}
			if response.Code != http.StatusCreated {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusCreated)
			}
			if response.Body.String() != "downstream body" {
				t.Fatalf("body = %q, want downstream body", response.Body.String())
			}
			if response.Header().Get("X-Downstream") != "preserved" {
				t.Fatalf("X-Downstream = %q, want preserved", response.Header().Get("X-Downstream"))
			}
			if got := len(response.Header().Values("Set-Cookie")); got != 1 {
				t.Fatalf("Set-Cookie count = %d, want 1", got)
			}
		})
	}
}

func TestExpireLegacySessionCookiePreservesEarlyResponse(t *testing.T) {
	handler := expireLegacySessionCookie(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("X-Early-Error", "preserved")
		writer.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = writer.Write([]byte("early error"))
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/validate", nil)
	request.AddCookie(&http.Cookie{Name: "crackledate_session", Value: "retired-value"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	if response.Body.String() != "early error" {
		t.Fatalf("body = %q, want early error", response.Body.String())
	}
	if response.Header().Get("X-Early-Error") != "preserved" {
		t.Fatalf("X-Early-Error = %q, want preserved", response.Header().Get("X-Early-Error"))
	}
}

func TestExpireLegacySessionCookieDoesNothingWithoutRetiredCookie(t *testing.T) {
	tests := []struct {
		name         string
		cookieHeader string
	}{
		{name: "no cookies"},
		{name: "unrelated cookie", cookieHeader: "theme=dark; preferences=compact"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handled := false
			handler := expireLegacySessionCookie(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				handled = true
				writer.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
			if test.cookieHeader != "" {
				request.Header.Set("Cookie", test.cookieHeader)
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if !handled {
				t.Fatal("downstream handler was not called")
			}
			if response.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
			}
			if got := response.Header().Values("Set-Cookie"); len(got) != 0 {
				t.Fatalf("Set-Cookie = %q, want none", got)
			}
		})
	}
}

func TestExpireLegacySessionCookieEmitsOneCompleteExpirationBeforeDownstreamWrite(t *testing.T) {
	setBeforeDownstreamWrite := false
	handler := expireLegacySessionCookie(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		setBeforeDownstreamWrite = len(writer.Header().Values("Set-Cookie")) == 1
		writer.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.AddCookie(&http.Cookie{Name: "crackledate_session", Value: "top-secret-retired-value"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if !setBeforeDownstreamWrite {
		t.Fatal("expiration cookie was not present before downstream wrote its response")
	}
	setCookieHeaders := response.Header().Values("Set-Cookie")
	if len(setCookieHeaders) != 1 {
		t.Fatalf("Set-Cookie count = %d, want 1", len(setCookieHeaders))
	}
	if strings.Contains(setCookieHeaders[0], "top-secret-retired-value") {
		t.Fatalf("Set-Cookie echoes retired value: %q", setCookieHeaders[0])
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("parsed cookie count = %d, want 1", len(cookies))
	}
	expiration := cookies[0]
	if expiration.Name != "crackledate_session" {
		t.Fatalf("cookie name = %q, want crackledate_session", expiration.Name)
	}
	if expiration.Value != "" {
		t.Fatalf("cookie value = %q, want empty", expiration.Value)
	}
	if expiration.Path != "/" {
		t.Fatalf("cookie Path = %q, want /", expiration.Path)
	}
	if expiration.Domain != "" || cookieAttributePresent(setCookieHeaders[0], "Domain") {
		t.Fatalf("cookie unexpectedly sets Domain: %q", setCookieHeaders[0])
	}
	if expiration.Expires.IsZero() || !expiration.Expires.Before(time.Now()) {
		t.Fatalf("cookie Expires = %v, want a past time", expiration.Expires)
	}
	if expiration.MaxAge >= 0 {
		t.Fatalf("cookie MaxAge = %d, want negative", expiration.MaxAge)
	}
	if !expiration.HttpOnly {
		t.Fatal("cookie is not HttpOnly")
	}
	if expiration.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie SameSite = %v, want Lax", expiration.SameSite)
	}
	if expiration.Secure || cookieAttributePresent(setCookieHeaders[0], "Secure") {
		t.Fatalf("cookie unexpectedly sets Secure: %q", setCookieHeaders[0])
	}
}

func TestExpireLegacySessionCookieHandlesDuplicateAndUnrelatedCookiesOnce(t *testing.T) {
	handler := expireLegacySessionCookie(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.Header.Set(
		"Cookie",
		"theme=dark; crackledate_session=first-retired-value; preferences=compact; crackledate_session=second-retired-value",
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	setCookieHeaders := response.Header().Values("Set-Cookie")
	if len(setCookieHeaders) != 1 {
		t.Fatalf("Set-Cookie count = %d, want 1", len(setCookieHeaders))
	}
	if strings.Contains(setCookieHeaders[0], "first-retired-value") || strings.Contains(setCookieHeaders[0], "second-retired-value") {
		t.Fatalf("Set-Cookie echoes a retired value: %q", setCookieHeaders[0])
	}
}

func cookieAttributePresent(setCookieHeader string, attribute string) bool {
	parts := strings.Split(setCookieHeader, ";")
	for _, part := range parts[1:] {
		name := strings.TrimSpace(strings.SplitN(part, "=", 2)[0])
		if strings.EqualFold(name, attribute) {
			return true
		}
	}
	return false
}
