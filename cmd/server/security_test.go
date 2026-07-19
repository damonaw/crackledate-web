package main

import (
	"fmt"
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

func TestEvaluateAndValidateJSONResponsesAreNoStore(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
		body    string
		status  int
	}{
		{name: "evaluate success", handler: handleEvaluate, body: `{"date":"2026-05-16","equation":"1+1"}`, status: http.StatusOK},
		{name: "evaluate error", handler: handleEvaluate, body: `{"unexpected":true}`, status: http.StatusBadRequest},
		{name: "validate success", handler: handleValidate, body: `{"date":"2026-05-16","equation":"5+√16=2^0+2+6","mode":"classic"}`, status: http.StatusOK},
		{name: "validate error", handler: handleValidate, body: `{"date":`, status: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(test.body))
			response := httptest.NewRecorder()

			test.handler(response, request)

			if response.Code != test.status {
				t.Fatalf("status = %d, want %d; body %s", response.Code, test.status, response.Body.String())
			}
			assertNoStoreJSON(t, response)
		})
	}
}

func TestDefaultRateLimitRules(t *testing.T) {
	config := defaultRateLimitConfig(newClientAddressResolver(nil, nil))
	want := map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/hint"}:     30,
		{method: http.MethodPost, path: "/api/evaluate"}: 240,
		{method: http.MethodPost, path: "/api/validate"}: 120,
	}
	if len(config.limits) != len(want) {
		t.Fatalf("default rule count = %d, want %d: %#v", len(config.limits), len(want), config.limits)
	}
	for rule, limit := range want {
		if config.limits[rule] != limit {
			t.Errorf("default limit for %#v = %d, want %d", rule, config.limits[rule], limit)
		}
	}
}

func TestRateLimitAPIRejectsBurstAndResetsAfterWindow(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	config := testRateLimitConfig(func() time.Time { return now }, 16, map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/validate"}: 2,
	})
	handled := 0
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		handled++
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	first := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")
	second := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")
	third := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")

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
	fourth := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")

	if fourth.Code != http.StatusNoContent {
		t.Fatalf("expected request after window reset through, got %d", fourth.Code)
	}
	if handled != 3 {
		t.Fatalf("handled requests after reset = %d", handled)
	}
}

func TestRateLimitAPISeparatesClientsAndPaths(t *testing.T) {
	config := testRateLimitConfig(time.Now, 16, map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/validate"}: 1,
	})
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	_ = rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")
	sameClient := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234")
	otherClient := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.11:1234")
	otherPath := rateLimitedRequest(handler, http.MethodPost, "/api/health", "203.0.113.10:1234")

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

func TestRateLimitAPIRestrictsHintPOST(t *testing.T) {
	config := defaultRateLimitConfig(newClientAddressResolver(nil, nil))
	handled := 0
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		handled++
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	for index := 0; index < 30; index++ {
		response := rateLimitedRequest(handler, http.MethodPost, "/api/hint", "203.0.113.10:1234")
		if response.Code != http.StatusNoContent {
			t.Fatalf("request %d unexpectedly returned %d", index+1, response.Code)
		}
	}
	response := rateLimitedRequest(handler, http.MethodPost, "/api/hint", "203.0.113.10:1234")
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 31st hint request to be limited, got %d", response.Code)
	}
	if handled != 30 {
		t.Fatalf("handled requests = %d, want 30", handled)
	}
}

func TestRateLimitAPIIsMethodAndPathSpecific(t *testing.T) {
	config := testRateLimitConfig(time.Now, 16, map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/hint"}:     1,
		{method: http.MethodPost, path: "/api/validate"}: 1,
	})
	handler := rateLimitAPI(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}), config)

	_ = rateLimitedRequest(handler, http.MethodPost, "/api/hint", "203.0.113.10:1234")
	if response := rateLimitedRequest(handler, http.MethodPost, "/api/hint", "203.0.113.10:1234"); response.Code != http.StatusTooManyRequests {
		t.Fatalf("second POST /api/hint = %d, want 429", response.Code)
	}
	if response := rateLimitedRequest(handler, http.MethodGet, "/api/hint", "203.0.113.10:1234"); response.Code != http.StatusNoContent {
		t.Fatalf("GET /api/hint = %d, want unlisted pass-through", response.Code)
	}
	if response := rateLimitedRequest(handler, http.MethodGet, "/api/validate", "203.0.113.10:1234"); response.Code != http.StatusNoContent {
		t.Fatalf("GET /api/validate = %d, want unlisted pass-through", response.Code)
	}
	if response := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234"); response.Code != http.StatusNoContent {
		t.Fatalf("first POST /api/validate = %d, want pass-through", response.Code)
	}
	if response := rateLimitedRequest(handler, http.MethodPost, "/api/validate", "203.0.113.10:1234"); response.Code != http.StatusTooManyRequests {
		t.Fatalf("second POST /api/validate = %d, want 429", response.Code)
	}
}

func TestRateLimiterNeverExceedsConfiguredCapacity(t *testing.T) {
	config := testRateLimitConfig(time.Now, 32, map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/hint"}: 30,
	})
	limiter := newRateLimiter(config)

	for index := 0; index < 10_000; index++ {
		request := httptest.NewRequest(http.MethodPost, "/api/hint", nil)
		request.RemoteAddr = fmt.Sprintf("198.51.%d.%d:443", (index/254)%254, index%254+1)
		if !limiter.allow(request) {
			t.Fatalf("unique request %d unexpectedly limited", index)
		}
		if got := len(limiter.clients); got > config.capacity {
			t.Fatalf("limiter size grew to %d, capacity %d", got, config.capacity)
		}
	}
	if got := len(limiter.clients); got != config.capacity {
		t.Fatalf("limiter size = %d, want %d", got, config.capacity)
	}
}

func TestRateLimiterEvictsLeastRecentlyUsedEntry(t *testing.T) {
	config := testRateLimitConfig(time.Now, 2, map[rateLimitRule]int{
		{method: http.MethodPost, path: "/api/hint"}: 1,
	})
	limiter := newRateLimiter(config)

	requestA := newRateLimiterRequest("203.0.113.1:443")
	requestB := newRateLimiterRequest("203.0.113.2:443")
	requestC := newRateLimiterRequest("203.0.113.3:443")
	if !limiter.allow(requestA) || !limiter.allow(requestB) {
		t.Fatal("expected initial requests through")
	}
	if limiter.allow(requestA) {
		t.Fatal("expected second A request to be limited while refreshing A recency")
	}
	if !limiter.allow(requestC) {
		t.Fatal("expected C request through")
	}
	if !limiter.allow(requestB) {
		t.Fatal("expected least-recently-used B entry to have been evicted")
	}
}

func TestTrustedProxyConfigRejectsInvalidCIDR(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
	}{
		{name: "generic", env: map[string]string{"TRUSTED_PROXY_CIDRS": "192.0.2.0/24,not-a-cidr"}},
		{name: "cloudflare", env: map[string]string{"TRUSTED_CLOUDFLARE_PROXY_CIDRS": "bad"}},
		{name: "empty list element", env: map[string]string{"TRUSTED_PROXY_CIDRS": "192.0.2.0/24,,198.51.100.0/24"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseRuntimeSecurityConfig(mapEnvironment(test.env)); err == nil {
				t.Fatal("expected invalid trusted proxy CIDR error")
			}
		})
	}
}

func TestHintConcurrencyConfigUsesDefaultWhenUnset(t *testing.T) {
	config, err := parseRuntimeSecurityConfig(mapEnvironment(nil))
	if err != nil {
		t.Fatalf("parseRuntimeSecurityConfig: %v", err)
	}
	if config.maxConcurrentHintSolves != 4 {
		t.Fatalf("maxConcurrentHintSolves = %d, want 4", config.maxConcurrentHintSolves)
	}
}

func TestHintConcurrencyConfigAcceptsOneAndSixteen(t *testing.T) {
	for _, value := range []string{"1", "16"} {
		t.Run(value, func(t *testing.T) {
			config, err := parseRuntimeSecurityConfig(mapEnvironment(map[string]string{"MAX_CONCURRENT_HINT_SOLVES": value}))
			if err != nil {
				t.Fatalf("parseRuntimeSecurityConfig: %v", err)
			}
			if fmt.Sprint(config.maxConcurrentHintSolves) != value {
				t.Fatalf("maxConcurrentHintSolves = %d, want %s", config.maxConcurrentHintSolves, value)
			}
		})
	}
}

func TestHintConcurrencyConfigRejectsZeroSeventeenNonIntegerAndMalformedValues(t *testing.T) {
	for _, value := range []string{"0", "17", "1.5", "four", "+4", " 4 ", "4x"} {
		t.Run(value, func(t *testing.T) {
			if _, err := parseRuntimeSecurityConfig(mapEnvironment(map[string]string{"MAX_CONCURRENT_HINT_SOLVES": value})); err == nil {
				t.Fatalf("expected %q to be rejected", value)
			}
		})
	}
}

func TestInitializeRuntimeRejectsInvalidSecurityConfiguration(t *testing.T) {
	tests := []map[string]string{
		{"TRUSTED_PROXY_CIDRS": "invalid"},
		{"TRUSTED_CLOUDFLARE_PROXY_CIDRS": "also-invalid"},
		{"MAX_CONCURRENT_HINT_SOLVES": "0"},
	}
	for index, environment := range tests {
		t.Run(fmt.Sprintf("case-%d", index), func(t *testing.T) {
			_, err := initializeRuntime(mapEnvironment(environment))
			if err == nil {
				t.Fatal("expected invalid runtime configuration error")
			}
		})
	}
}

func testRateLimitConfig(now func() time.Time, capacity int, limits map[rateLimitRule]int) rateLimitConfig {
	return rateLimitConfig{
		window:   time.Minute,
		limits:   limits,
		capacity: capacity,
		now:      now,
		resolver: newClientAddressResolver(nil, nil),
	}
}

func rateLimitedRequest(handler http.Handler, method string, path string, remoteAddr string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	request.RemoteAddr = remoteAddr
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func newRateLimiterRequest(remoteAddr string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/api/hint", nil)
	request.RemoteAddr = remoteAddr
	return request
}

func mapEnvironment(values map[string]string) func(string) string {
	return func(key string) string {
		return values[key]
	}
}
