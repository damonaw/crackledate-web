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
	if response.LeftValue == nil || *response.LeftValue != "0.666666666667" {
		t.Fatalf("LeftValue = %#v", response.LeftValue)
	}
	if response.RightValue == nil || *response.RightValue != "0.666666666667" {
		t.Fatalf("RightValue = %#v", response.RightValue)
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
