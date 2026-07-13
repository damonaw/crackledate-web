package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientAddressIgnoresForwardedHeadersFromUntrustedPeer(t *testing.T) {
	resolver := newClientAddressResolver(nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("CF-Connecting-IP", "203.0.113.10")
	request.Header.Set("X-Forwarded-For", "198.51.100.7, 198.51.100.8")
	request.Header.Set("CF-IPCountry", "US")
	request.Header.Set("CF-Ray", "spoofed-DEN")
	request.RemoteAddr = "192.0.2.44:443"

	client := resolver.resolve(request)

	if client.address != "192.0.2.44" || client.source != "remote-addr" {
		t.Fatalf("resolved client = %#v", client)
	}
	if client.country != "" || client.cfRay != "" {
		t.Fatalf("trusted spoofed Cloudflare metadata: %#v", client)
	}
}

func TestClientAddressUsesCloudflareHeaderFromTrustedCloudflarePeer(t *testing.T) {
	resolver := mustClientResolver(t, nil, []string{"192.0.2.0/24"})
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("CF-Connecting-IP", " 203.0.113.10 ")
	request.Header.Set("X-Forwarded-For", "198.51.100.7, 198.51.100.8")
	request.Header.Set("CF-IPCountry", "US")
	request.Header.Set("CF-Ray", "abc123-DEN")
	request.RemoteAddr = "192.0.2.44:443"

	client := resolver.resolve(request)

	if client.address != "203.0.113.10" || client.source != "cf-connecting-ip" {
		t.Fatalf("resolved client = %#v", client)
	}
	if client.country != "US" || client.cfRay != "abc123-DEN" {
		t.Fatalf("Cloudflare metadata = %#v", client)
	}
}

func TestClientAddressIgnoresCloudflareHeaderFromGenericTrustedPeer(t *testing.T) {
	resolver := mustClientResolver(t, []string{"192.0.2.0/24"}, nil)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("CF-Connecting-IP", "203.0.113.10")
	request.Header.Set("X-Forwarded-For", "198.51.100.7")
	request.Header.Set("CF-IPCountry", "US")
	request.Header.Set("CF-Ray", "spoofed-DEN")
	request.RemoteAddr = "192.0.2.44:443"

	client := resolver.resolve(request)

	if client.address != "198.51.100.7" || client.source != "x-forwarded-for" {
		t.Fatalf("resolved client = %#v", client)
	}
	if client.country != "" || client.cfRay != "" {
		t.Fatalf("generic proxy supplied Cloudflare metadata: %#v", client)
	}
}

func TestClientAddressWalksForwardedChainRightToLeft(t *testing.T) {
	resolver := mustClientResolver(t, []string{"192.0.2.0/24", "198.51.100.0/24"}, nil)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Forwarded-For", "203.0.113.10, 198.51.100.8, 192.0.2.45")
	request.RemoteAddr = "192.0.2.44:443"

	client := resolver.resolve(request)

	if client.address != "203.0.113.10" || client.source != "x-forwarded-for" {
		t.Fatalf("resolved client = %#v", client)
	}

	request.Header.Set("X-Forwarded-For", "spoofed-leftmost, 203.0.113.11")
	client = resolver.resolve(request)
	if client.address != "192.0.2.44" || client.source != "remote-addr" {
		t.Fatalf("malformed chain should fall back to peer, got %#v", client)
	}
}

func TestClientAddressRejectsMalformedForwardedAddress(t *testing.T) {
	resolver := mustClientResolver(t, []string{"192.0.2.0/24"}, []string{"198.51.100.0/24"})
	tests := []struct {
		name       string
		remoteAddr string
		header     string
		value      string
	}{
		{name: "forwarded for", remoteAddr: "192.0.2.44:443", header: "X-Forwarded-For", value: "203.0.113.10, not-an-ip"},
		{name: "cloudflare", remoteAddr: "198.51.100.44:443", header: "CF-Connecting-IP", value: "203.0.113.10, 198.51.100.2"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.RemoteAddr = test.remoteAddr
			request.Header.Set(test.header, test.value)
			client := resolver.resolve(request)
			if client.address != hostOnly(test.remoteAddr) || client.source != "remote-addr" {
				t.Fatalf("resolved malformed address as %#v", client)
			}
		})
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

func TestRequestLoggerIgnoresCloudflareMetadataFromUntrustedPeer(t *testing.T) {
	resolver := newClientAddressResolver(nil, nil)
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	output, entry := recordRequestLog(t, resolver, now, func(request *http.Request) {
		request.RemoteAddr = "192.0.2.44:443"
		request.Header.Set("CF-Connecting-IP", "203.0.113.10")
		request.Header.Set("CF-IPCountry", "US")
		request.Header.Set("CF-Ray", "spoofed-DEN")
	})

	expectedHashes := clientHashes("192.0.2.44", "test-secret", now)
	if entry["clientDay"] != expectedHashes.Day || entry["clientWeek"] != expectedHashes.Week {
		t.Fatalf("logger trusted spoofed address: %#v", entry)
	}
	if entry["clientSource"] != "remote-addr" || entry["country"] != "" || entry["cfRay"] != "" {
		t.Fatalf("logger trusted spoofed Cloudflare fields: %#v", entry)
	}
	if bytes.Contains(output, []byte("203.0.113.10")) {
		t.Fatalf("log exposed spoofed raw client IP: %s", output)
	}
}

func TestRequestLoggerUsesSharedTrustedClientResolution(t *testing.T) {
	resolver := mustClientResolver(t, []string{"192.0.2.0/24"}, nil)
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	output, entry := recordRequestLog(t, resolver, now, func(request *http.Request) {
		request.RemoteAddr = "192.0.2.44:443"
		request.Header.Set("X-Forwarded-For", "203.0.113.10")
	})

	expectedHashes := clientHashes("203.0.113.10", "test-secret", now)
	if entry["clientDay"] != expectedHashes.Day || entry["clientWeek"] != expectedHashes.Week {
		t.Fatalf("logger did not use shared resolver: %#v", entry)
	}
	if entry["clientSource"] != "x-forwarded-for" || entry["status"] != float64(http.StatusCreated) {
		t.Fatalf("unexpected trusted log fields: %#v", entry)
	}
	if bytes.Contains(output, []byte("203.0.113.10")) {
		t.Fatalf("log exposed raw client IP: %s", output)
	}
}

func mustClientResolver(t *testing.T, generic []string, cloudflare []string) *clientAddressResolver {
	t.Helper()
	resolver, err := clientAddressResolverFromCIDRs(generic, cloudflare)
	if err != nil {
		t.Fatalf("clientAddressResolverFromCIDRs: %v", err)
	}
	return resolver
}

func hostOnly(remoteAddr string) string {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = remoteAddr
	return newClientAddressResolver(nil, nil).resolve(request).address
}

func recordRequestLog(
	t *testing.T,
	resolver *clientAddressResolver,
	now time.Time,
	configure func(*http.Request),
) ([]byte, map[string]any) {
	t.Helper()
	var output bytes.Buffer
	analytics := analyticsConfig{
		hashSecret: "test-secret",
		now:        func() time.Time { return now },
		output:     &output,
	}
	handler := requestLogger(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusCreated)
	}), analytics, resolver)
	request := httptest.NewRequest(http.MethodGet, "/api/puzzle?date=2026-05-29", nil)
	configure(request)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatalf("failed to decode request log: %v\n%s", err, output.String())
	}
	return output.Bytes(), entry
}
