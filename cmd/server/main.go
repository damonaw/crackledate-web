package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
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
	submissions := newSubmissionStore(submissionsPathFromEnvironment())

	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.HandleFunc("/api/submissions", handleSubmitSolution(submissions, time.Now))
	mux.HandleFunc("/", handleStatic(publicFiles))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           securityHeaders(requestLogger(mux, defaultAnalyticsConfig())),
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

type analyticsConfig struct {
	hashSecret string
	now        func() time.Time
	output     io.Writer
}

type clientHashSet struct {
	Day  string
	Week string
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func defaultAnalyticsConfig() analyticsConfig {
	return analyticsConfig{
		hashSecret: strings.TrimSpace(os.Getenv("CLIENT_HASH_SECRET")),
		now:        time.Now,
		output:     os.Stdout,
	}
}

func (config analyticsConfig) timeNow() time.Time {
	if config.now != nil {
		return config.now()
	}
	return time.Now()
}

func (config analyticsConfig) logOutput() io.Writer {
	if config.output != nil {
		return config.output
	}
	return os.Stdout
}

func clientAddress(request *http.Request) (string, string) {
	if value := strings.TrimSpace(request.Header.Get("CF-Connecting-IP")); value != "" {
		return value, "cf-connecting-ip"
	}
	if value := strings.TrimSpace(request.Header.Get("X-Forwarded-For")); value != "" {
		first, _, _ := strings.Cut(value, ",")
		if first = strings.TrimSpace(first); first != "" {
			return first, "x-forwarded-for"
		}
	}
	if host, _, err := net.SplitHostPort(strings.TrimSpace(request.RemoteAddr)); err == nil && host != "" {
		return host, "remote-addr"
	}
	return strings.TrimSpace(request.RemoteAddr), "remote-addr"
}

func clientHashes(clientIP, secret string, now time.Time) clientHashSet {
	now = now.UTC()
	year, week := now.ISOWeek()
	return clientHashSet{
		Day:  clientHash(secret, now.Format("2006-01-02"), clientIP),
		Week: clientHash(secret, fmt.Sprintf("%04d-W%02d", year, week), clientIP),
	}
}

func clientHash(secret, period, clientIP string) string {
	sum := sha256.Sum256([]byte(secret + "\x00" + period + "\x00" + clientIP))
	return hex.EncodeToString(sum[:])[:24]
}

func (recorder *statusRecorder) WriteHeader(status int) {
	recorder.status = status
	recorder.ResponseWriter.WriteHeader(status)
}

func (recorder *statusRecorder) Write(body []byte) (int, error) {
	if recorder.status == 0 {
		recorder.status = http.StatusOK
	}
	return recorder.ResponseWriter.Write(body)
}

func requestLogger(next http.Handler, config analyticsConfig) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: writer}
		next.ServeHTTP(recorder, request)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}

		clientIP, clientSource := clientAddress(request)
		hashes := clientHashes(clientIP, config.hashSecret, config.timeNow())
		entry := map[string]any{
			"time":         time.Now().UTC().Format(time.RFC3339Nano),
			"level":        "INFO",
			"msg":          "request",
			"method":       request.Method,
			"path":         request.URL.Path,
			"status":       recorder.status,
			"durationMs":   time.Since(start).Milliseconds(),
			"clientDay":    hashes.Day,
			"clientWeek":   hashes.Week,
			"clientSource": clientSource,
			"country":      strings.TrimSpace(request.Header.Get("CF-IPCountry")),
			"cfRay":        strings.TrimSpace(request.Header.Get("CF-Ray")),
			"userAgent":    strings.TrimSpace(request.UserAgent()),
			"referer":      strings.TrimSpace(request.Referer()),
		}
		if err := json.NewEncoder(config.logOutput()).Encode(entry); err != nil {
			log.Printf("request log: %v", err)
		}
	})
}
