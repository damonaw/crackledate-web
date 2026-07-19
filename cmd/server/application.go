package main

import (
	"io/fs"
	"net/http"

	"crackledate-web/internal/game"
)

func newApplicationHandler(config runtimeSecurityConfig, publicFiles fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.Handle("/api/hint", newHintHandler(game.GenerateHint, config.maxConcurrentHintSolves, game.DefaultSearchBudget))
	mux.HandleFunc("/api/", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "Not found"})
	})
	mux.HandleFunc("/", handleStatic(publicFiles))

	return expireLegacySessionCookie(
		securityHeaders(
			requestLogger(
				rateLimitAPI(mux, defaultRateLimitConfig(config.resolver)),
				defaultAnalyticsConfig(),
				config.resolver,
			),
		),
	)
}
