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
	"sync"
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

const maxAPIJSONBodyBytes int64 = 32 * 1024

func main() {
	mux := http.NewServeMux()
	publicFiles := mustPublicFS()
	submissions, err := newSubmissionStore(submissionsPathFromEnvironment())
	if err != nil {
		log.Fatal(err)
	}
	defer submissions.close()
	auth, err := newAuthService(submissions.db, emailConfigFromEnvironment(), time.Now)
	if err != nil {
		log.Fatal(err)
	}

	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.HandleFunc("/api/submissions", handleSubmitSolution(submissions, auth, time.Now))
	mux.HandleFunc("/api/auth/signup", auth.handleSignup)
	mux.HandleFunc("/api/auth/login", auth.handleLogin)
	mux.HandleFunc("/api/auth/logout", auth.handleLogout)
	mux.HandleFunc("/api/auth/me", auth.handleMe)
	mux.HandleFunc("/api/auth/verify", auth.handleVerifyLink)
	mux.HandleFunc("/api/auth/verify-code", auth.handleVerifyCode)
	mux.HandleFunc("/api/auth/resend-verification", auth.handleResendVerification)
	mux.HandleFunc("/api/me/preferences", auth.handlePreferences)
	mux.HandleFunc("/api/me/solutions", auth.handleSolutions)
	mux.HandleFunc("/api/me/solutions/import", auth.handleImportSolutions)
	mux.HandleFunc("/", handleStatic(publicFiles))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           securityHeaders(requestLogger(rateLimitAPI(mux, defaultRateLimitConfig()), defaultAnalyticsConfig())),
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
	if err := decodeJSONBody(writer, request, &payload); err != nil {
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
	if err := decodeJSONBody(writer, request, &payload); err != nil {
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

func decodeJSONBody(writer http.ResponseWriter, request *http.Request, payload any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, maxAPIJSONBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(payload); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("invalid trailing request body")
	}
	return nil
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

type rateLimitConfig struct {
	window time.Duration
	limits map[string]int
	now    func() time.Time
}

type rateLimitEntry struct {
	windowStart time.Time
	count       int
	lastSeen    time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	config  rateLimitConfig
	clients map[string]rateLimitEntry
}

func defaultAnalyticsConfig() analyticsConfig {
	return analyticsConfig{
		hashSecret: strings.TrimSpace(os.Getenv("CLIENT_HASH_SECRET")),
		now:        time.Now,
		output:     os.Stdout,
	}
}

func defaultRateLimitConfig() rateLimitConfig {
	return rateLimitConfig{
		window: time.Minute,
		limits: map[string]int{
			"/api/evaluate":                 240,
			"/api/validate":                 120,
			"/api/submissions":              20,
			"/api/auth/signup":              5,
			"/api/auth/login":               10,
			"/api/auth/verify-code":         10,
			"/api/auth/resend-verification": 3,
			"/api/me/preferences":           60,
			"/api/me/solutions/import":      5,
		},
		now: time.Now,
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

func (config rateLimitConfig) timeNow() time.Time {
	if config.now != nil {
		return config.now()
	}
	return time.Now()
}

func rateLimitAPI(next http.Handler, config rateLimitConfig) http.Handler {
	limiter := &rateLimiter{
		config:  config,
		clients: make(map[string]rateLimitEntry),
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if isMutatingMethod(request.Method) && !limiter.allow(request) {
			writer.Header().Set("Retry-After", fmt.Sprintf("%.0f", config.window.Seconds()))
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "Too many requests"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func isMutatingMethod(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
}

func (limiter *rateLimiter) allow(request *http.Request) bool {
	limit, ok := limiter.config.limits[request.URL.Path]
	if !ok || limit <= 0 {
		return true
	}

	clientIP, _ := clientAddress(request)
	if clientIP == "" {
		clientIP = "unknown"
	}

	now := limiter.config.timeNow()
	key := request.URL.Path + "\x00" + clientIP

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	entry := limiter.clients[key]
	if entry.windowStart.IsZero() || now.Before(entry.windowStart) || now.Sub(entry.windowStart) >= limiter.config.window {
		entry.windowStart = now
		entry.count = 0
	}
	entry.count++
	entry.lastSeen = now
	limiter.clients[key] = entry

	if len(limiter.clients) > 4096 {
		limiter.cleanup(now)
	}

	return entry.count <= limit
}

func (limiter *rateLimiter) cleanup(now time.Time) {
	ttl := limiter.config.window * 2
	for key, entry := range limiter.clients {
		if now.Sub(entry.lastSeen) > ttl {
			delete(limiter.clients, key)
		}
	}
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
