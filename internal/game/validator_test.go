package game

import "testing"

func TestValidateEquationAcceptsKnownMaySixteenthSolution(t *testing.T) {
	response := ValidateEquation("5+√16=2^0+2+6", []int{5, 1, 6, 2, 0, 2, 6})

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
	response := ValidateEquation("5+√61=2^0+2+6", []int{5, 1, 6, 2, 0, 2, 6})

	if response.Valid {
		t.Fatal("expected invalid equation")
	}
	if response.ErrorMessage != "Digits must be used in date order" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
}

func TestValidateEquationReportsUnequalSides(t *testing.T) {
	response := ValidateEquation("5+1+6=2+0+2+6", []int{5, 1, 6, 2, 0, 2, 6})

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
	response := ValidateEquation("5^24=5^24", []int{5, 2, 4, 5, 2, 4})

	if !response.Valid {
		t.Fatalf("expected valid equation, got %q", response.ErrorMessage)
	}
	if response.LeftValue == nil || *response.LeftValue != "59604644775390625" {
		t.Fatalf("LeftValue = %#v", response.LeftValue)
	}
}

func TestValidateEquationUsesExactRationalEquality(t *testing.T) {
	response := ValidateEquation("1/3+1/3=2/3", []int{1, 3, 1, 3, 2, 3})

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

func TestRunningValuesStillRejectsExtremelyLargeExponent(t *testing.T) {
	response := RunningValues("51^3^20=")

	if response.ErrorMessage != "Calculated number is too large" {
		t.Fatalf("ErrorMessage = %q", response.ErrorMessage)
	}
	if response.Left != "?" {
		t.Fatalf("Left = %q", response.Left)
	}
}
