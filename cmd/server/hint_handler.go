package main

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"crackledate-web/internal/game"
)

const (
	maxHintRawQueryBytes    = 1024
	maxHintDateBytes        = 32
	maxHintModeBytes        = 32
	maxHintTargetValueBytes = 64
	maxHintPrefixBytes      = 256
)

type hintSolver func([]int, string, string, string) (string, error)

type hintHandler struct {
	solver hintSolver
	gate   chan struct{}
}

func newHintHandler(solver hintSolver, maxConcurrent int) http.Handler {
	return &hintHandler{
		solver: solver,
		gate:   make(chan struct{}, maxConcurrent),
	}
}

func (handler *hintHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if len(request.URL.RawQuery) > maxHintRawQueryBytes {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid query"})
		return
	}
	query, err := url.ParseQuery(request.URL.RawQuery)
	if err != nil ||
		!queryValuesWithinLimit(query, "date", maxHintDateBytes) ||
		!queryValuesWithinLimit(query, "mode", maxHintModeBytes) ||
		!queryValuesWithinLimit(query, "targetValue", maxHintTargetValueBytes) ||
		!queryValuesWithinLimit(query, "prefix", maxHintPrefixBytes) {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid query"})
		return
	}

	date, err := game.ParsePuzzleDate(query.Get("date"), time.Now())
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}
	select {
	case handler.gate <- struct{}{}:
		defer func() { <-handler.gate }()
	default:
		writer.Header().Set("Retry-After", "1")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "Hint service is busy"})
		return
	}

	puzzle := game.PuzzleForDate(date)
	mode := query.Get("mode")
	targetValue := query.Get("targetValue")
	prefix := query.Get("prefix")
	solution, err := handler.solver(puzzle.Digits, mode, targetValue, prefix)
	if err != nil {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "No solution found"})
		return
	}
	writeHintSolution(writer, solution, mode, prefix, puzzle.Digits)
}

func queryValuesWithinLimit(query url.Values, key string, maximum int) bool {
	for _, value := range query[key] {
		if len(value) > maximum {
			return false
		}
	}
	return true
}

func writeHintSolution(writer http.ResponseWriter, solution string, mode string, prefix string, digits []int) {
	var step1, step2, step3 string
	step3 = solution

	switch mode {
	case "double_equality":
		parts := strings.Split(solution, "=")
		evaluation := game.RunningValues(solution)
		step1 = evaluation.Left
		if len(parts) >= 2 {
			step2 = parts[0] + "=" + parts[1]
		} else {
			step2 = parts[0]
		}
	case "target":
		parts := strings.Split(solution, "=")
		if len(parts) >= 2 {
			step1 = parts[0]
			step2 = getSmartPrefix(parts[1])
		} else {
			step1 = parts[0]
			step2 = parts[0]
		}
	case "single_expr":
		step1 = getSmartHalfPrefix(solution)
		step2 = getSmartAlmostPrefix(solution)
	default:
		parts := strings.Split(solution, "=")
		evaluation := game.RunningValues(solution)
		step1 = evaluation.Left
		step2 = parts[0]
	}

	balancingHint, mathTip := computeBalancingHintAndTip(solution, mode, prefix, digits)
	writeJSON(writer, http.StatusOK, map[string]string{
		"solution":      solution,
		"step1":         step1,
		"step2":         step2,
		"step3":         step3,
		"balancingHint": balancingHint,
		"mathTip":       mathTip,
	})
}
