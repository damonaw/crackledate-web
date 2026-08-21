package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestApplicationHasNoSubmissionEndpoint(t *testing.T) {
	publicFiles := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("app")},
	}
	handler := newApplicationHandler(runtimeSecurityConfig{resolver: newClientAddressResolver(nil, nil)}, fs.FS(publicFiles))

	for _, method := range []string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodPatch,
		http.MethodDelete,
	} {
		t.Run(method, func(t *testing.T) {
			const sentinel = "submission-body-must-not-be-reflected"
			request := httptest.NewRequest(method, "/api/submissions", strings.NewReader(sentinel))
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404; body %q", response.Code, response.Body.String())
			}
			if got := response.Header().Get("Content-Type"); got != "application/json" {
				t.Fatalf("Content-Type = %q", got)
			}
			if got := response.Header().Get("Cache-Control"); got != "no-store" {
				t.Fatalf("Cache-Control = %q", got)
			}
			if got := response.Body.String(); got != "{\"error\":\"Not found\"}\n" {
				t.Fatalf("body = %q", got)
			}
			if strings.Contains(response.Body.String(), sentinel) {
				t.Fatal("response reflected request body")
			}
		})
	}
}

func TestApplicationHasNoHintEndpoint(t *testing.T) {
	publicFiles := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("app")},
	}
	handler := newApplicationHandler(runtimeSecurityConfig{
		resolver: newClientAddressResolver(nil, nil),
	}, fs.FS(publicFiles))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/hint", strings.NewReader(`{"date":"2026-06-19"}`)))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body %q", response.Code, response.Body.String())
	}
	if response.Body.String() != "{\"error\":\"Not found\"}\n" {
		t.Fatalf("body = %q", response.Body.String())
	}
}

func TestRuntimeInitializationReadsNoStorageConfiguration(t *testing.T) {
	readKeys := map[string]bool{}
	_, err := initializeRuntime(func(key string) string {
		readKeys[key] = true
		return ""
	})
	if err != nil {
		t.Fatalf("initializeRuntime: %v", err)
	}
	for _, forbidden := range []string{
		"SUBMISSIONS_PATH",
		"RETIRE_LEGACY_ACCOUNT_DATA",
		"CLIENT_HASH_SECRET",
	} {
		if readKeys[forbidden] {
			t.Fatalf("read forbidden runtime key %s", forbidden)
		}
	}
}
