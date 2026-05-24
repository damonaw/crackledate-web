package game

import (
	"math"
	"strings"
	"unicode"
)

type EvaluationResponse struct {
	Left         string `json:"left"`
	Right        string `json:"right"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

type ValidationResponse struct {
	Valid        bool    `json:"valid"`
	LeftValue    *string `json:"leftValue,omitempty"`
	RightValue   *string `json:"rightValue,omitempty"`
	ErrorMessage string  `json:"errorMessage,omitempty"`
}

func RunningValues(equation string) EvaluationResponse {
	parts := strings.SplitN(equation, "=", 2)
	if strings.Contains(equation, "=") {
		left, leftErr := evaluateDisplay(parts[0])
		right, rightErr := evaluateDisplay(parts[1])
		return EvaluationResponse{
			Left:         left,
			Right:        right,
			ErrorMessage: firstError(leftErr, rightErr),
		}
	}

	left, err := evaluateDisplay(equation)
	return EvaluationResponse{
		Left:         left,
		Right:        "?",
		ErrorMessage: err,
	}
}

func ValidateEquation(equation string, expectedDigits []int) ValidationResponse {
	if strings.TrimSpace(equation) == "" {
		return invalid("Equation cannot be empty")
	}
	if strings.Count(equation, "=") != 1 {
		return invalid("Equation must contain exactly one equals sign")
	}
	if !digitsMatch(equation, expectedDigits) {
		return invalid("Digits must be used in date order")
	}

	parts := strings.SplitN(equation, "=", 2)
	if strings.TrimSpace(parts[0]) == "" {
		return invalid("Left side of equation is empty")
	}
	if strings.TrimSpace(parts[1]) == "" {
		return invalid("Right side of equation is empty")
	}

	left, err := Evaluate(parts[0])
	if err != nil {
		return invalid(readableError(err))
	}
	right, err := Evaluate(parts[1])
	if err != nil {
		return invalid(readableError(err))
	}

	leftText := formatNumber(left)
	rightText := formatNumber(right)
	if math.Abs(left-right) > tolerance {
		return ValidationResponse{
			Valid:        false,
			LeftValue:    &leftText,
			RightValue:   &rightText,
			ErrorMessage: "Left side (" + leftText + ") does not equal right side (" + rightText + ")",
		}
	}

	return ValidationResponse{
		Valid:      true,
		LeftValue:  &leftText,
		RightValue: &rightText,
	}
}

func digitsMatch(equation string, expectedDigits []int) bool {
	found := make([]int, 0, len(expectedDigits))
	for _, char := range equation {
		if unicode.IsDigit(char) {
			found = append(found, int(char-'0'))
		}
	}
	if len(found) != len(expectedDigits) {
		return false
	}
	for index, digit := range expectedDigits {
		if found[index] != digit {
			return false
		}
	}
	return true
}

func evaluateDisplay(expression string) (string, string) {
	if strings.TrimSpace(expression) == "" {
		return "?", ""
	}
	value, err := Evaluate(expression)
	if err != nil {
		return "?", readableError(err)
	}
	return formatNumber(value), ""
}

func invalid(message string) ValidationResponse {
	return ValidationResponse{Valid: false, ErrorMessage: message}
}

func firstError(messages ...string) string {
	for _, message := range messages {
		if message != "" {
			return message
		}
	}
	return ""
}

func readableError(err error) string {
	message := err.Error()
	switch {
	case strings.Contains(message, errNumberLarge.Error()):
		return "Calculated number is too large"
	case strings.Contains(strings.ToLower(message), "imaginary"):
		return "Result is an imaginary number"
	case strings.Contains(strings.ToLower(message), "division by zero"):
		return "Cannot divide by zero"
	default:
		return "Equation could not be evaluated"
	}
}
