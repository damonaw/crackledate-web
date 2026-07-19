package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
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

func TestRequestLoggerEmitsOnlyOperationalFields(t *testing.T) {
	const sentinel = "private-query-and-header-sentinel"
	var output bytes.Buffer
	handler := requestLogger(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusCreated)
	}), &output)
	request := httptest.NewRequest(http.MethodGet, "/api/puzzle?date="+sentinel, nil)
	request.RemoteAddr = "203.0.113.10:443"
	request.Header.Set("User-Agent", sentinel)
	request.Header.Set("Referer", "https://example.invalid/"+sentinel)
	request.Header.Set("CF-IPCountry", "US")
	request.Header.Set("CF-Ray", sentinel)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatalf("failed to decode request log: %v\n%s", err, output.String())
	}
	wantKeys := []string{"durationMs", "level", "method", "path", "status", "timestamp"}
	gotKeys := make([]string, 0, len(entry))
	for _, key := range wantKeys {
		if _, exists := entry[key]; exists {
			gotKeys = append(gotKeys, key)
		}
	}
	if !reflect.DeepEqual(gotKeys, wantKeys) || len(entry) != len(wantKeys) {
		t.Fatalf("log keys = %v; entry = %#v", gotKeys, entry)
	}
	if entry["path"] != "/api/puzzle" || entry["status"] != float64(http.StatusCreated) {
		t.Fatalf("unexpected operational fields: %#v", entry)
	}
	if bytes.Contains(output.Bytes(), []byte(sentinel)) || bytes.Contains(output.Bytes(), []byte("203.0.113.10")) {
		t.Fatalf("log retained request identity or query data: %s", output.String())
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
