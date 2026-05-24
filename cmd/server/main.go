package main

import (
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"crackledate-web/internal/game"
)

//go:embed all:public
var embeddedPublic embed.FS

type evaluateRequest struct {
	Date     string `json:"date"`
	Equation string `json:"equation"`
}

type validateRequest struct {
	Date     string `json:"date"`
	Equation string `json:"equation"`
}

func main() {
	mux := http.NewServeMux()
	publicFiles := mustPublicFS()

	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.HandleFunc("/", handleStatic(publicFiles))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("crackledate web listening on :%s", port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func handleHealth(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func handlePuzzle(writer http.ResponseWriter, request *http.Request) {
	date, err := game.ParsePuzzleDate(request.URL.Query().Get("date"), time.Now())
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}
	writeJSON(writer, http.StatusOK, game.PuzzleForDate(date))
}

func handleEvaluate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload evaluateRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	writeJSON(writer, http.StatusOK, game.RunningValues(payload.Equation))
}

func handleValidate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload validateRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	date, err := game.ParsePuzzleDate(payload.Date, time.Now())
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}
	puzzle := game.PuzzleForDate(date)
	writeJSON(writer, http.StatusOK, game.ValidateEquation(payload.Equation, puzzle.Digits))
}

func handleStatic(publicFiles fs.FS) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		cleanPath := path.Clean(strings.TrimPrefix(request.URL.Path, "/"))
		if cleanPath == "." {
			cleanPath = "index.html"
		}
		body, err := fs.ReadFile(publicFiles, cleanPath)
		if err != nil {
			cleanPath = "index.html"
			body, err = fs.ReadFile(publicFiles, cleanPath)
			if err != nil {
				http.Error(writer, "Not found", http.StatusNotFound)
				return
			}
		}
		if contentType := mime.TypeByExtension(path.Ext(cleanPath)); contentType != "" {
			writer.Header().Set("Content-Type", contentType)
		}
		writer.WriteHeader(http.StatusOK)
		if request.Method != http.MethodHead {
			_, _ = writer.Write(body)
		}
	}
}

func mustPublicFS() fs.FS {
	public, err := fs.Sub(embeddedPublic, "public")
	if err != nil {
		panic(err)
	}
	return public
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		log.Printf("write json: %v", err)
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		writer.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(writer, request)
	})
}
