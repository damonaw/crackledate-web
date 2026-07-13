package main

import (
	"net/http"
	"testing"
	"time"
)

type identityHandler struct{}

func (*identityHandler) ServeHTTP(http.ResponseWriter, *http.Request) {}

func TestNewHTTPServerUsesShippingLimits(t *testing.T) {
	handler := &identityHandler{}
	server := newHTTPServer(":8123", handler)

	if server.Addr != ":8123" {
		t.Fatalf("Addr = %q, want %q", server.Addr, ":8123")
	}
	if server.Handler != handler {
		t.Fatal("Handler does not preserve the supplied handler identity")
	}
	if server.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", server.ReadHeaderTimeout, 5*time.Second)
	}
	if server.ReadTimeout != 10*time.Second {
		t.Fatalf("ReadTimeout = %s, want %s", server.ReadTimeout, 10*time.Second)
	}
	if server.WriteTimeout != 30*time.Second {
		t.Fatalf("WriteTimeout = %s, want %s", server.WriteTimeout, 30*time.Second)
	}
	if server.IdleTimeout != 60*time.Second {
		t.Fatalf("IdleTimeout = %s, want %s", server.IdleTimeout, 60*time.Second)
	}
	if server.MaxHeaderBytes != 32*1024 {
		t.Fatalf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, 32*1024)
	}
}
