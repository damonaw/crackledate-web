package main

import (
	"io/fs"
	"net/http"
	"os"

)

func newApplicationHandler(config runtimeSecurityConfig, publicFiles fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.HandleFunc("/api/", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "Not found"})
	})
	mux.HandleFunc("/", handleStatic(publicFiles))

	return expireLegacySessionCookie(
		securityHeaders(
			requestLogger(rateLimitAPI(mux, defaultRateLimitConfig(config.resolver)), os.Stdout),
		),
	)
}
