package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"crackledate-web/internal/game"
)

const (
	maxHintDateBytes        = 32
	maxHintModeBytes        = 32
	maxHintPrefixBytes      = 256
	maxHintTargetValueBytes = 64
)

type hintRequest struct {
	Date        string `json:"date"`
	Mode        string `json:"mode"`
	Prefix      string `json:"prefix"`
	TargetValue string `json:"targetValue,omitempty"`
}

type hintSolver func(
	context.Context,
	[]int,
	string,
	string,
	string,
	game.SearchBudget,
) (game.Hint, game.SearchStats, error)

type hintHandler struct {
	solver hintSolver
	gate   chan struct{}
	budget game.SearchBudget
}

func newHintHandler(solver hintSolver, maxConcurrent int, budget game.SearchBudget) http.Handler {
	if maxConcurrent < 1 {
		maxConcurrent = 1
	}
	return &hintHandler{
		solver: solver,
		gate:   make(chan struct{}, maxConcurrent),
		budget: budget,
	}
}

func (handler *hintHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var payload hintRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	if len(payload.Date) > maxHintDateBytes ||
		len(payload.Mode) > maxHintModeBytes ||
		len(payload.Prefix) > maxHintPrefixBytes ||
		len(payload.TargetValue) > maxHintTargetValueBytes ||
		payload.Mode != "classic" {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	date, err := game.ParsePuzzleDate(payload.Date, time.Now())
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}
	if request.Context().Err() != nil {
		return
	}

	select {
	case handler.gate <- struct{}{}:
		defer func() { <-handler.gate }()
	case <-request.Context().Done():
		return
	default:
		writer.Header().Set("Retry-After", "1")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "Hint service is busy"})
		return
	}

	puzzle := game.PuzzleForDate(date)
	hint, _, err := handler.solver(
		request.Context(),
		puzzle.Digits,
		payload.Mode,
		payload.TargetValue,
		payload.Prefix,
		handler.budget,
	)
	if request.Context().Err() != nil || errors.Is(err, context.Canceled) {
		return
	}
	if err == nil {
		writeJSON(writer, http.StatusOK, hint)
		return
	}
	if errors.Is(err, game.ErrNoSolution) {
		writeJSON(writer, http.StatusNotFound, map[string]string{"error": "No solution found"})
		return
	}
	if errors.Is(err, game.ErrSearchBudgetExceeded) || errors.Is(err, context.DeadlineExceeded) {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"error": "No hint available yet"})
		return
	}
	writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "Hint service unavailable"})
}
