package game

import (
	"context"
	"errors"
	"math"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type cancelOnThirdCheckContext struct {
	checks atomic.Int32
}

func (*cancelOnThirdCheckContext) Deadline() (time.Time, bool) { return time.Time{}, false }
func (*cancelOnThirdCheckContext) Done() <-chan struct{}       { return nil }
func (*cancelOnThirdCheckContext) Value(any) any               { return nil }

func (ctx *cancelOnThirdCheckContext) Err() error {
	if ctx.checks.Add(1) >= 3 {
		return context.Canceled
	}
	return nil
}

func TestSolvePuzzleWithBudgetIsDeterministicForRootPowerPrefix(t *testing.T) {
	digits := []int{5, 1, 6, 2, 0, 2, 6}
	prefix := "5+√16"
	budget := DefaultSearchBudget
	budget.MaxDuration = 30 * time.Second
	var first string

	for run := 0; run < 20; run++ {
		solution, stats, err := SolvePuzzleWithBudget(
			context.Background(),
			digits,
			"classic",
			"",
			prefix,
			budget,
		)
		if err != nil {
			t.Fatalf("run %d: solve: %v (stats: %#v)", run, err, stats)
		}
		if !hasPrefixIgnoreParentheses(solution, normalizeEquation(prefix)) {
			t.Fatalf("run %d: solution %q does not match prefix %q", run, solution, prefix)
		}
		if !strings.Contains(solution, "√") || !strings.Contains(solution, "^") {
			t.Fatalf("run %d: solution %q does not exercise root and power", run, solution)
		}
		if result := ValidateEquation(solution, digits, "classic", ""); !result.Valid {
			t.Fatalf("run %d: solution %q is invalid: %s", run, solution, result.ErrorMessage)
		}
		if stats.CandidateConstructions == 0 {
			t.Fatalf("run %d: candidate constructions = 0", run)
		}
		if run == 0 {
			first = solution
		} else if solution != first {
			t.Fatalf("run %d: solution = %q, want deterministic %q", run, solution, first)
		}
	}
}

func TestDefaultSearchBudgetContract(t *testing.T) {
	if DefaultSearchBudget.MaxCandidateConstructions != 5_000_000 ||
		DefaultSearchBudget.MaxDuration != 3*time.Second ||
		DefaultSearchBudget.CancellationCheckInterval != 1_024 {
		t.Fatalf("default search budget = %#v", DefaultSearchBudget)
	}
}

func TestSolvePuzzleWithBudgetRejectsExpiredWallBudget(t *testing.T) {
	budget := DefaultSearchBudget
	budget.MaxDuration = 1
	_, stats, err := SolvePuzzleWithBudget(context.Background(), []int{1, 1}, "classic", "", "", budget)
	if !errors.Is(err, ErrSearchBudgetExceeded) {
		t.Fatalf("error = %v, want %v", err, ErrSearchBudgetExceeded)
	}
	if stats.CandidateConstructions != 0 {
		t.Fatalf("candidate constructions = %d, want 0", stats.CandidateConstructions)
	}
}

func TestSolvePuzzleWithBudgetStopsAtCandidateLimit(t *testing.T) {
	budget := DefaultSearchBudget
	budget.MaxCandidateConstructions = 1

	_, stats, err := SolvePuzzleWithBudget(
		context.Background(),
		[]int{1, 1},
		"classic",
		"",
		"",
		budget,
	)
	if !errors.Is(err, ErrSearchBudgetExceeded) {
		t.Fatalf("error = %v, want %v", err, ErrSearchBudgetExceeded)
	}
	if stats.CandidateConstructions != 1 {
		t.Fatalf("candidate constructions = %d, want 1", stats.CandidateConstructions)
	}
}

func TestSolvePuzzleWithBudgetHonorsPreCancelledContextQuickly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	started := time.Now()

	_, stats, err := SolvePuzzleWithBudget(ctx, []int{1, 1}, "classic", "", "", DefaultSearchBudget)
	elapsed := time.Since(started)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want %v", err, context.Canceled)
	}
	if stats.CandidateConstructions != 0 {
		t.Fatalf("candidate constructions = %d, want 0", stats.CandidateConstructions)
	}
	if elapsed > 50*time.Millisecond {
		t.Fatalf("pre-cancelled search took %s, want <= 50ms", elapsed)
	}
}

func TestSolvePuzzleWithBudgetChecksCancellationOutsideConstructionSampling(t *testing.T) {
	budget := DefaultSearchBudget
	budget.CancellationCheckInterval = math.MaxUint64
	ctx := &cancelOnThirdCheckContext{}

	_, _, err := SolvePuzzleWithBudget(ctx, []int{1, 1}, "classic", "", "", budget)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want cancellation during generation or selection", err)
	}
}

func TestSolvePuzzleWithBudgetRejectsNonClassicMode(t *testing.T) {
	_, stats, err := SolvePuzzleWithBudget(
		context.Background(),
		[]int{1, 1},
		"target",
		"1",
		"",
		DefaultSearchBudget,
	)
	if err == nil || err.Error() != "hint mode must be classic" {
		t.Fatalf("error = %v, want %q", err, "hint mode must be classic")
	}
	if stats.CandidateConstructions != 0 {
		t.Fatalf("candidate constructions = %d, want 0", stats.CandidateConstructions)
	}
}

func TestSolvePuzzleWithBudgetRejectsUnmatchedPrefix(t *testing.T) {
	_, _, err := SolvePuzzleWithBudget(
		context.Background(),
		[]int{1, 1},
		"classic",
		"",
		"999",
		DefaultSearchBudget,
	)
	if !errors.Is(err, ErrNoSolution) {
		t.Fatalf("error = %v, want %v", err, ErrNoSolution)
	}
}

func TestSolvePuzzleWithBudgetAllowsLaterSplitForPartialLHS(t *testing.T) {
	digits := []int{2, 3, 8}
	solution, _, err := SolvePuzzleWithBudget(
		context.Background(),
		digits,
		"classic",
		"",
		"2^",
		DefaultSearchBudget,
	)
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if !hasPrefixIgnoreParentheses(solution, normalizeEquation("2^")) {
		t.Fatalf("solution = %q, want partial LHS prefix 2^", solution)
	}
	if result := ValidateEquation(solution, digits, "classic", ""); !result.Valid {
		t.Fatalf("solution %q is invalid: %s", solution, result.ErrorMessage)
	}
}

func TestSolvePuzzleWithBudgetPinsSplitForPartialRHS(t *testing.T) {
	digits := []int{2, 3, 8}
	solution, _, err := SolvePuzzleWithBudget(
		context.Background(),
		digits,
		"classic",
		"",
		"2^3=",
		DefaultSearchBudget,
	)
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if !hasPrefixIgnoreParentheses(solution, normalizeEquation("2^3=")) {
		t.Fatalf("solution = %q, want partial RHS prefix 2^3=", solution)
	}
	if result := ValidateEquation(solution, digits, "classic", ""); !result.Valid {
		t.Fatalf("solution %q is invalid: %s", solution, result.ErrorMessage)
	}
}

func TestSolvePuzzleWithBudgetReturnsCompleteValidPrefix(t *testing.T) {
	digits := []int{2, 3, 8}
	prefix := "2^3=8"
	solution, stats, err := SolvePuzzleWithBudget(
		context.Background(),
		digits,
		"classic",
		"",
		prefix,
		DefaultSearchBudget,
	)
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if solution != prefix {
		t.Fatalf("solution = %q, want completed prefix %q", solution, prefix)
	}
	if stats.CandidateConstructions == 0 {
		t.Fatal("canonical search bypassed enumeration for a completed prefix")
	}
}

func TestSolvePuzzleWrapperCompletesExactEvaluableLHS(t *testing.T) {
	digits := []int{6, 2, 0, 2, 0, 2, 6}
	prefix := "6+2-√0"
	solution, err := SolvePuzzle(digits, "classic", "", prefix)
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if !hasPrefixIgnoreParentheses(solution, normalizeEquation(prefix)) {
		t.Fatalf("solution = %q, want exact evaluable LHS prefix %q", solution, prefix)
	}
	if result := ValidateEquation(solution, digits, "classic", ""); !result.Valid {
		t.Fatalf("solution %q is invalid: %s", solution, result.ErrorMessage)
	}
}

func TestHasCleanEndingDoesNotTreatUnaryNegationAsBinary(t *testing.T) {
	for _, expression := range []string{"-1", "--1", "-(1+2)"} {
		if hasCleanEnding(expression) {
			t.Errorf("hasCleanEnding(%q) = true, want false", expression)
		}
	}
	if !hasCleanEnding("10-4") {
		t.Error("hasCleanEnding(\"10-4\") = false, want true")
	}
}

func TestAdvancedGenerationIncludesDepthTwoUnaryCandidates(t *testing.T) {
	state := newSearchState(context.Background(), DefaultSearchBudget)
	expressions, err := genAdvanced([]int{3}, make(map[string][]solvedExpr), state)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	for _, expression := range expressions {
		if expression.str == "(3!)!" && expression.unaryDepth == 2 {
			return
		}
	}
	t.Fatal("advanced generation omitted depth-two unary candidate (3!)!")
}

func TestGenerateHintBuildsClassicSteps(t *testing.T) {
	hint, stats, err := GenerateHint(
		context.Background(),
		[]int{1, 1},
		"classic",
		"",
		"",
		DefaultSearchBudget,
	)
	if err != nil {
		t.Fatalf("generate hint: %v", err)
	}
	if hint.Solution != "1=1" {
		t.Fatalf("solution = %q, want %q", hint.Solution, "1=1")
	}
	if hint.Step1 != "1" || hint.Step2 != "1" || hint.Step3 != "1=1" {
		t.Fatalf("steps = %q/%q/%q", hint.Step1, hint.Step2, hint.Step3)
	}
	if stats.CandidateConstructions == 0 {
		t.Fatal("candidate constructions = 0")
	}
}

func TestComputeBalancingHint(t *testing.T) {
	tests := []struct {
		name         string
		sol          string
		mode         string
		prefix       string
		digits       []int
		expectedHint string
		expectedTip  string
	}{
		{
			name:         "classic addition",
			sol:          "2*3=6*1",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 6, 1},
			expectedHint: "The left side equals 6. You need to use the remaining digits (6, 1) to also make 6 on the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 6 using: 6 × 1 = 6",
		},
		{
			name:         "classic subtraction",
			sol:          "2*3=10-4",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 1, 0, 4},
			expectedHint: "The left side equals 6. You need to use the remaining digits (1, 0, 4) to also make 6 on the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 6 using: 10 − 4 = 6",
		},
		{
			name:         "other mode",
			sol:          "2*3=6*1",
			mode:         "target",
			prefix:       "2*3=",
			digits:       []int{2, 3, 6, 1},
			expectedHint: "",
			expectedTip:  "",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actualHint, actualTip := computeBalancingHintAndTip(test.sol, test.mode, test.prefix, test.digits)
			if actualHint != test.expectedHint {
				t.Errorf("expected hint %q, got %q", test.expectedHint, actualHint)
			}
			if actualTip != test.expectedTip {
				t.Errorf("expected tip %q, got %q", test.expectedTip, actualTip)
			}
		})
	}
}
