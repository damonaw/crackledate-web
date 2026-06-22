package game

import (
	"fmt"
	"strings"
	"unicode"
)

type EvaluationResponse struct {
	Left         string `json:"left"`
	Middle       string `json:"middle,omitempty"`
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
	parts := strings.Split(equation, "=")
	if len(parts) == 1 {
		left, err := evaluateDisplay(parts[0])
		return EvaluationResponse{
			Left:         left,
			Right:        "?",
			ErrorMessage: err,
		}
	}
	if len(parts) == 2 {
		left, leftErr := evaluateDisplay(parts[0])
		right, rightErr := evaluateDisplay(parts[1])
		return EvaluationResponse{
			Left:         left,
			Right:        right,
			ErrorMessage: firstError(leftErr, rightErr),
		}
	}

	left, leftErr := evaluateDisplay(parts[0])
	middle, middleErr := evaluateDisplay(parts[1])
	rightExpr := strings.Join(parts[2:], "=")
	right, rightErr := evaluateDisplay(rightExpr)
	return EvaluationResponse{
		Left:         left,
		Middle:       middle,
		Right:        right,
		ErrorMessage: firstError(leftErr, middleErr, rightErr),
	}
}

func ValidateEquation(equation string, expectedDigits []int, mode string, targetValue string) ValidationResponse {
	if strings.TrimSpace(equation) == "" {
		return invalid("Equation cannot be empty")
	}
	if !digitsMatch(equation, expectedDigits) {
		return invalid("Digits must be used in date order")
	}

	switch mode {
	case "double_equality":
		if strings.Count(equation, "=") != 2 {
			return invalid("Double equality equation must contain exactly two equals signs")
		}
		parts := strings.SplitN(equation, "=", 3)
		if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" || strings.TrimSpace(parts[2]) == "" {
			return invalid("All parts of the double equality must be non-empty")
		}

		left, err := Evaluate(parts[0])
		if err != nil {
			return invalid(readableError(err))
		}
		middle, err := Evaluate(parts[1])
		if err != nil {
			return invalid(readableError(err))
		}
		right, err := Evaluate(parts[2])
		if err != nil {
			return invalid(readableError(err))
		}

		leftText := formatNumber(left)
		middleText := formatNumber(middle)
		rightText := formatNumber(right)

		if !numbersEqual(left, middle) || !numbersEqual(middle, right) {
			return ValidationResponse{
				Valid:        false,
				LeftValue:    &leftText,
				RightValue:   &rightText,
				ErrorMessage: fmt.Sprintf("Sides are not equal: %s = %s = %s", leftText, middleText, rightText),
			}
		}

		return ValidationResponse{
			Valid:      true,
			LeftValue:  &leftText,
			RightValue: &rightText,
		}

	case "target":
		if strings.Count(equation, "=") != 1 {
			return invalid("Target equation must contain exactly one equals sign")
		}
		parts := strings.SplitN(equation, "=", 2)
		if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			return invalid("Both sides of target equation must be non-empty")
		}

		targetNum, err := Evaluate(targetValue)
		if err != nil {
			return invalid("Invalid target value")
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

		if !numbersEqual(left, right) {
			return ValidationResponse{
				Valid:        false,
				LeftValue:    &leftText,
				RightValue:   &rightText,
				ErrorMessage: "Left side (" + leftText + ") does not equal right side (" + rightText + ")",
			}
		}

		if !numbersEqual(left, targetNum) {
			targetText := formatNumber(targetNum)
			return ValidationResponse{
				Valid:        false,
				LeftValue:    &leftText,
				RightValue:   &rightText,
				ErrorMessage: fmt.Sprintf("Equation evaluates to %s, but must equal target (%s)", leftText, targetText),
			}
		}

		return ValidationResponse{
			Valid:      true,
			LeftValue:  &leftText,
			RightValue: &rightText,
		}

	case "single_expr":
		if strings.Contains(equation, "=") {
			return invalid("Single expression mode must not contain any equals signs")
		}

		targetNum, err := Evaluate(targetValue)
		if err != nil {
			return invalid("Invalid target value")
		}

		val, err := Evaluate(equation)
		if err != nil {
			return invalid(readableError(err))
		}

		valText := formatNumber(val)
		if !numbersEqual(val, targetNum) {
			targetText := formatNumber(targetNum)
			return ValidationResponse{
				Valid:        false,
				LeftValue:    &valText,
				ErrorMessage: fmt.Sprintf("Expression evaluates to %s, but must equal target (%s)", valText, targetText),
			}
		}

		return ValidationResponse{
			Valid:     true,
			LeftValue: &valText,
		}

	default:
		if strings.Count(equation, "=") != 1 {
			return invalid("Equation must contain exactly one equals sign")
		}
		parts := strings.SplitN(equation, "=", 2)
		if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			return invalid("Both sides of equation must be non-empty")
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
		if !numbersEqual(left, right) {
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
