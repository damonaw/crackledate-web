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
	Date        string `json:"date"`
	Equation    string `json:"equation"`
	Mode        string `json:"mode,omitempty"`
	TargetValue string `json:"targetValue,omitempty"`
}

const maxAPIJSONBodyBytes int64 = 32 * 1024

func main() {
	runtimeConfig, submissions, err := initializeRuntime(os.Getenv, newSubmissionStore)
	if err != nil {
		log.Fatal(err)
	}
	defer submissions.close()

	mux := http.NewServeMux()
	publicFiles := mustPublicFS()

	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/puzzle", handlePuzzle)
	mux.HandleFunc("/api/evaluate", handleEvaluate)
	mux.HandleFunc("/api/validate", handleValidate)
	mux.HandleFunc("/api/submissions", handleSubmitSolution(submissions, time.Now))
	mux.Handle("/api/hint", newHintHandler(game.SolvePuzzle, runtimeConfig.maxConcurrentHintSolves))
	mux.HandleFunc("/", handleStatic(publicFiles))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := newHTTPServer(
		":"+port,
		expireLegacySessionCookie(
			securityHeaders(requestLogger(rateLimitAPI(mux, defaultRateLimitConfig(runtimeConfig.resolver)), defaultAnalyticsConfig(), runtimeConfig.resolver)),
		),
	)

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
	writeJSON(writer, http.StatusOK, game.ValidateEquation(payload.Equation, puzzle.Digits, payload.Mode, payload.TargetValue))
}

func getSmartPrefix(s string) string {
	runes := []rune(s)
	if len(runes) <= 3 {
		return string(runes)
	}
	return string(runes[:3]) + "..."
}

func getSmartHalfPrefix(s string) string {
	runes := []rune(s)
	half := len(runes) / 2
	if half < 3 {
		half = 3
	}
	if half >= len(runes) {
		return s
	}
	return string(runes[:half]) + "..."
}

func getSmartAlmostPrefix(s string) string {
	runes := []rune(s)
	if len(runes) <= 4 {
		return s
	}
	return string(runes[:len(runes)-2]) + "..."
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

func requestLogger(next http.Handler, config analyticsConfig, resolver *clientAddressResolver) http.Handler {
	if resolver == nil {
		resolver = newClientAddressResolver(nil, nil)
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: writer}
		next.ServeHTTP(recorder, request)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}

		client := resolver.resolve(request)
		hashes := clientHashes(client.address, config.hashSecret, config.timeNow())
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
			"clientSource": client.source,
			"country":      client.country,
			"cfRay":        client.cfRay,
			"userAgent":    strings.TrimSpace(request.UserAgent()),
			"referer":      strings.TrimSpace(request.Referer()),
		}
		if err := json.NewEncoder(config.logOutput()).Encode(entry); err != nil {
			log.Printf("request log: %v", err)
		}
	})
}

func stripOuterParentheses(s string) string {
	for len(s) >= 2 && s[0] == '(' && s[len(s)-1] == ')' {
		depth := 0
		match := true
		for i := 0; i < len(s)-1; i++ {
			if s[i] == '(' {
				depth++
			} else if s[i] == ')' {
				depth--
				if depth == 0 {
					match = false
					break
				}
			}
		}
		if match && depth == 1 {
			s = s[1 : len(s)-1]
		} else {
			break
		}
	}
	return s
}

func findLastTopLevelOperator(s string) int {
	depth := 0
	lastOpIdx := -1
	for i, r := range s {
		if r == '(' {
			depth++
		} else if r == ')' {
			depth--
		} else if depth == 0 {
			if r == '+' || r == '-' || r == '*' || r == '/' || r == '^' {
				lastOpIdx = i
			}
		}
	}
	return lastOpIdx
}

func countDigits(s string) int {
	count := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			count++
		}
	}
	return count
}

func formatExprForDisplay(s string) string {
	s = strings.ReplaceAll(s, "*", " × ")
	s = strings.ReplaceAll(s, "/", " ÷ ")
	s = strings.ReplaceAll(s, "-", " − ")
	s = strings.ReplaceAll(s, "+", " + ")
	s = strings.ReplaceAll(s, "  ", " ")
	return strings.TrimSpace(s)
}

func computeBalancingHintAndTip(sol string, mode string, prefix string, digits []int) (string, string) {
	if mode != "classic" {
		return "", ""
	}
	parts := strings.Split(sol, "=")
	if len(parts) != 2 {
		return "", ""
	}
	lhs := strings.ReplaceAll(parts[0], " ", "")
	rhs := strings.ReplaceAll(parts[1], " ", "")

	// Check that the prefix includes an '=' so the LHS is complete.
	if !strings.Contains(prefix, "=") {
		return "", ""
	}

	// Evaluate the LHS to get the target value for the RHS.
	evalRes := game.RunningValues(lhs)
	if evalRes.Left == "?" || evalRes.Left == "" {
		return "", ""
	}
	targetVal := evalRes.Left

	// Figure out unused digits.
	usedCount := countDigits(prefix)
	if usedCount >= len(digits) {
		return "", ""
	}
	unusedDigits := digits[usedCount:]
	if len(unusedDigits) < 2 {
		return "", ""
	}

	// Build a readable list of the unused digits.
	digitStrs := make([]string, len(unusedDigits))
	for i, d := range unusedDigits {
		digitStrs[i] = fmt.Sprintf("%d", d)
	}
	digitList := strings.Join(digitStrs, ", ")

	// --- Step 1: Balancing hint ---
	hint := fmt.Sprintf("The left side equals %s. You need to use the remaining digits (%s) to also make %s on the right side.", targetVal, digitList, targetVal)

	// --- Step 2: Math tip ---
	// Scan the full RHS for identity patterns.
	tip := ""
	if strings.Contains(rhs, "^0") {
		tip = "Tip: remember that x^0 = 1 (any number raised to 0 is equal to 1)."
	} else if strings.Contains(rhs, "!") {
		tip = "Tip: remember that x! is the factorial of x (e.g., 0! = 1, 3! = 6)."
	} else if strings.Contains(rhs, "√") {
		tip = "Tip: remember that √x is the square root of x (e.g., √4 = 2, √9 = 3)."
	} else if strings.Contains(rhs, "^") {
		tip = "Tip: remember that x^y is x raised to the power of y (e.g., 2^3 = 8)."
	} else if strings.Contains(rhs, "|") {
		tip = "Tip: remember that |x| is the absolute value of x (e.g., |-3| = 3)."
	} else {
		tip = "Tip: try combining the digits using arithmetic operations."
	}

	displayRhs := formatExprForDisplay(rhs)
	tip = fmt.Sprintf("%s You can make %s using: %s = %s", tip, targetVal, displayRhs, targetVal)

	return hint, tip
}
