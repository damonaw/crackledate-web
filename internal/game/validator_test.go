package game

import (
	"strings"
	"testing"
)

func TestValidateEquationAcceptsKnownMaySixteenthSolution(t *testing.T) {
	response := ValidateEquation("5+√16=2^0+2+6", []int{5, 1, 6, 2, 0, 2, 6}, "", "")

	if !response.Valid {
		t.Fatalf("expected valid equation, got %q", response.ErrorMessage)
	}
	if response.LeftValue == nil || *response.LeftValue != "9" {
		t.Fatalf("LeftValue = %#v", response.LeftValue)
	}
	if response.RightValue == nil || *response.RightValue != "9" {
		t.Fatalf("RightValue = %#v", response.RightValue)
	}
}

func TestValidateEquationRejectsOutOfOrderDigits(t *testing.T) {
	response := ValidateEquation("5+√61=2^0+2+6", []int{5, 1, 6, 2, 0, 2, 6}, "", "")

	if response.Valid {
		t.Fatal("expected invalid equation")
	}
	if response.ErrorMessage != "Digits must be used in date order" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
}

func TestValidateEquationReportsUnequalSides(t *testing.T) {
	response := ValidateEquation("5+1+6=2+0+2+6", []int{5, 1, 6, 2, 0, 2, 6}, "", "")

	if response.Valid {
		t.Fatal("expected invalid equation")
	}
	if response.ErrorMessage != "Left side (12) does not equal right side (10)" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
}

func TestRunningValuesEvaluatesPartialSides(t *testing.T) {
	response := RunningValues("5+√16=")

	if response.Left != "9" {
		t.Fatalf("Left = %q", response.Left)
	}
	if response.Right != "?" {
		t.Fatalf("Right = %q", response.Right)
	}
}

func TestRunningValuesAllowsLargeFinitePowerWithExactInteger(t *testing.T) {
	response := RunningValues("5^24=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "59604644775390625" {
		t.Fatalf("Left = %q", response.Left)
	}
	if response.Right != "?" {
		t.Fatalf("Right = %q", response.Right)
	}
}

func TestValidateEquationAcceptsLargeFinitePower(t *testing.T) {
	response := ValidateEquation("5^24=5^24", []int{5, 2, 4, 5, 2, 4}, "", "")

	if !response.Valid {
		t.Fatalf("expected valid equation, got %q", response.ErrorMessage)
	}
	if response.LeftValue == nil || *response.LeftValue != "59604644775390625" {
		t.Fatalf("LeftValue = %#v", response.LeftValue)
	}
}

func TestValidateEquationRejectsLeadingZeroNumberGroups(t *testing.T) {
	leadingZeroValues := RunningValues("2*026=")
	leadingZeroResult := ValidateEquation("61-9=2*026", []int{6, 1, 9, 2, 0, 2, 6}, "", "")
	separatedZeroValues := RunningValues("0+26=")
	separatedZeroResult := ValidateEquation("0+26=26", []int{0, 2, 6, 2, 6}, "", "")

	if leadingZeroValues.Left != "?" {
		t.Fatalf("leadingZeroValues.Left = %q", leadingZeroValues.Left)
	}
	if leadingZeroValues.ErrorMessage != "Numbers cannot start with zero" {
		t.Fatalf("leadingZeroValues.ErrorMessage = %q", leadingZeroValues.ErrorMessage)
	}
	if leadingZeroResult.Valid {
		t.Fatal("expected leading zero validation to fail")
	}
	if leadingZeroResult.ErrorMessage != "Numbers cannot start with zero" {
		t.Fatalf("leadingZeroResult.ErrorMessage = %q", leadingZeroResult.ErrorMessage)
	}
	if separatedZeroValues.Left != "26" {
		t.Fatalf("separatedZeroValues.Left = %q", separatedZeroValues.Left)
	}
	if separatedZeroValues.ErrorMessage != "" {
		t.Fatalf("separatedZeroValues.ErrorMessage = %q", separatedZeroValues.ErrorMessage)
	}
	if !separatedZeroResult.Valid {
		t.Fatalf("expected separated zero validation to pass, got %q", separatedZeroResult.ErrorMessage)
	}
	if separatedZeroResult.LeftValue == nil || *separatedZeroResult.LeftValue != "26" {
		t.Fatalf("separatedZeroResult.LeftValue = %#v", separatedZeroResult.LeftValue)
	}
	if separatedZeroResult.RightValue == nil || *separatedZeroResult.RightValue != "26" {
		t.Fatalf("separatedZeroResult.RightValue = %#v", separatedZeroResult.RightValue)
	}
}

func TestValidateEquationUsesExactRationalEquality(t *testing.T) {
	response := ValidateEquation("1/3+1/3=2/3", []int{1, 3, 1, 3, 2, 3}, "", "")

	if !response.Valid {
		t.Fatalf("expected valid equation, got %q", response.ErrorMessage)
	}
	if response.LeftValue == nil || *response.LeftValue != "0.6\u0305" {
		t.Fatalf("LeftValue = %#v", response.LeftValue)
	}
	if response.RightValue == nil || *response.RightValue != "0.6\u0305" {
		t.Fatalf("RightValue = %#v", response.RightValue)
	}
}

func TestRunningValuesFormatsRepeatingDecimalWithOverline(t *testing.T) {
	response := RunningValues("516/202=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "2.5\u03055\u03054\u03054\u0305" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesKeepsNonRepeatingDecimalPrefix(t *testing.T) {
	response := RunningValues("1/6=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "0.16\u0305" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesKeepsTerminatingDecimalsPlain(t *testing.T) {
	response := RunningValues("1/8=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "0.125" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesEvaluatesAbsoluteValue(t *testing.T) {
	response := RunningValues("|5|=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "5" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesAllowsImplicitMultiplicationBeforeAbsoluteValue(t *testing.T) {
	response := RunningValues("5|1|=")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "5" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesEvaluatesAbsoluteValueAfterPostfix(t *testing.T) {
	response := RunningValues("√20*2!*|6|")

	if response.ErrorMessage != "" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left == "?" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestRunningValuesStillRejectsExtremelyLargeExponent(t *testing.T) {
	response := RunningValues("51^3^20=")

	if response.ErrorMessage != "Calculated number is too large" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "?" {
		t.Fatalf("Left = %q", response.Left)
	}
}

func TestValidateEquationRejectsNonRealMathWithGenericUnsupportedResultCopy(t *testing.T) {
	values := RunningValues("√(-1)=")
	response := ValidateEquation("√(-1)=1", []int{1, 1}, "", "")

	if values.Left != "?" {
		t.Fatalf("values.Left = %q", values.Left)
	}
	if values.ErrorMessage != "Operation is outside supported real-number math" {
		t.Fatalf("values.ErrorMessage = %q", values.ErrorMessage)
	}
	if response.Valid {
		t.Fatal("expected invalid equation")
	}
	if response.ErrorMessage != "Operation is outside supported real-number math" {
		t.Fatalf("response.ErrorMessage = %q", response.ErrorMessage)
	}
}

func TestValidateDoubleEquality(t *testing.T) {
	response := ValidateEquation("6/(2+0!)=2-0=√(|2-6|)", []int{6, 2, 0, 2, 0, 2, 6}, "double_equality", "")
	if !response.Valid {
		t.Fatalf("expected valid double equality, got %q", response.ErrorMessage)
	}
}

func TestValidateTargetChallenge(t *testing.T) {
	response := ValidateEquation("6-2-0=2*0-2+6", []int{6, 2, 0, 2, 0, 2, 6}, "target", "4")
	if !response.Valid {
		t.Fatalf("expected valid target equation, got %q", response.ErrorMessage)
	}

	responseInvalid := ValidateEquation("6-2-0=2*0-2+6", []int{6, 2, 0, 2, 0, 2, 6}, "target", "10")
	if responseInvalid.Valid {
		t.Fatal("expected target mismatch to be invalid")
	}
}

func TestValidateSingleExpression(t *testing.T) {
	response := ValidateEquation("6+(20-(2+(0*26)))", []int{6, 2, 0, 2, 0, 2, 6}, "single_expr", "24")
	if !response.Valid {
		t.Fatalf("expected valid single expression, got %q", response.ErrorMessage)
	}
}

func TestSolvePuzzle(t *testing.T) {
	sol, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "")
	if err != nil {
		t.Fatalf("solver failed: %v", err)
	}
	if sol == "" {
		t.Fatal("expected a solution, got empty")
	}
}

func TestSolvePuzzleWithPrefix(t *testing.T) {
	sol, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "6/2")
	if err != nil {
		t.Fatalf("prefix solver failed: %v", err)
	}
	if !strings.HasPrefix(normalizeEquation(sol), "6/2") {
		t.Fatalf("expected solution to start with 6/2, got %q", sol)
	}
}

func TestSolvePuzzleWithUnsolvablePrefix(t *testing.T) {
	_, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "999")
	if err == nil {
		t.Fatal("expected solver to fail with unsolvable prefix, but it succeeded")
	}
}

func TestSolvePuzzleWith6Plus2(t *testing.T) {
	sol, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "6+2")
	if err != nil {
		t.Fatalf("unsolvable error: %v", err)
	}
	t.Logf("Solution found: %s", sol)
}

func TestSolvePuzzleWithDifferentParenthesesPrefix(t *testing.T) {
	sol, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "6+2=0+20-2*6")
	if err != nil {
		t.Fatalf("failed to solve with different parentheses: %v", err)
	}
	t.Logf("Solution found: %s", sol)
}

func TestSolvePuzzleWithCustomOperatorPrefix(t *testing.T) {
	sol, err := SolvePuzzle([]int{6, 2, 0, 2, 0, 2, 6}, "classic", "", "6+2-√0")
	if err != nil {
		t.Fatalf("failed to solve prefix with square root operator: %v", err)
	}
	t.Logf("Solution found with square root: %s", sol)
}

func TestSolvePuzzleWithExponentiation(t *testing.T) {
	sol, err := SolvePuzzle([]int{2, 3, 8}, "classic", "", "2^3")
	if err != nil {
		t.Fatalf("failed to solve with exponentiation prefix: %v", err)
	}
	t.Logf("Solution found with exponentiation: %s", sol)
	if !strings.Contains(sol, "^") {
		t.Fatalf("expected solution to contain '^', got %q", sol)
	}
}
