package game

import (
	"context"
	"fmt"
	"strings"
)

type Hint struct {
	Solution      string `json:"solution"`
	Step1         string `json:"step1"`
	Step2         string `json:"step2"`
	Step3         string `json:"step3"`
	BalancingHint string `json:"balancingHint,omitempty"`
	MathTip       string `json:"mathTip,omitempty"`
}

func GenerateHint(
	ctx context.Context,
	digits []int,
	mode string,
	targetValue string,
	prefix string,
	budget SearchBudget,
) (Hint, SearchStats, error) {
	solution, stats, err := SolvePuzzleWithBudget(ctx, digits, mode, targetValue, prefix, budget)
	if err != nil {
		return Hint{}, stats, err
	}

	leftSide, _, _ := strings.Cut(solution, "=")
	balancingHint, mathTip := computeBalancingHintAndTip(solution, mode, prefix, digits)
	return Hint{
		Solution:      solution,
		Step1:         RunningValues(solution).Left,
		Step2:         leftSide,
		Step3:         solution,
		BalancingHint: balancingHint,
		MathTip:       mathTip,
	}, stats, nil
}

func ComputeBalancingHintAndTip(solution string, mode string, prefix string, digits []int) (string, string) {
	return computeBalancingHintAndTip(solution, mode, prefix, digits)
}

func computeBalancingHintAndTip(solution string, mode string, prefix string, digits []int) (string, string) {
	if mode != "classic" {
		return "", ""
	}
	parts := strings.Split(solution, "=")
	if len(parts) != 2 {
		return "", ""
	}
	lhs := strings.ReplaceAll(parts[0], " ", "")
	rhs := strings.ReplaceAll(parts[1], " ", "")

	if !strings.Contains(prefix, "=") {
		return "", ""
	}

	evaluation := RunningValues(lhs)
	if evaluation.Left == "?" || evaluation.Left == "" {
		return "", ""
	}
	targetValue := evaluation.Left

	usedCount := countDigits(prefix)
	if usedCount >= len(digits) {
		return "", ""
	}
	unusedDigits := digits[usedCount:]
	if len(unusedDigits) < 2 {
		return "", ""
	}

	digitStrings := make([]string, len(unusedDigits))
	for index, digit := range unusedDigits {
		digitStrings[index] = fmt.Sprintf("%d", digit)
	}
	digitList := strings.Join(digitStrings, ", ")

	hint := fmt.Sprintf(
		"The left side equals %s. You need to use the remaining digits (%s) to also make %s on the right side.",
		targetValue,
		digitList,
		targetValue,
	)

	var tip string
	switch {
	case strings.Contains(rhs, "^0"):
		tip = "Tip: remember that x^0 = 1 (any number raised to 0 is equal to 1)."
	case strings.Contains(rhs, "!"):
		tip = "Tip: remember that x! is the factorial of x (e.g., 0! = 1, 3! = 6)."
	case strings.Contains(rhs, "√"):
		tip = "Tip: remember that √x is the square root of x (e.g., √4 = 2, √9 = 3)."
	case strings.Contains(rhs, "^"):
		tip = "Tip: remember that x^y is x raised to the power of y (e.g., 2^3 = 8)."
	case strings.Contains(rhs, "|"):
		tip = "Tip: remember that |x| is the absolute value of x (e.g., |-3| = 3)."
	default:
		tip = "Tip: try combining the digits using arithmetic operations."
	}

	displayRHS := formatHintExpressionForDisplay(rhs)
	tip = fmt.Sprintf("%s You can make %s using: %s = %s", tip, targetValue, displayRHS, targetValue)
	return hint, tip
}

func formatHintExpressionForDisplay(expression string) string {
	expression = strings.ReplaceAll(expression, "*", " × ")
	expression = strings.ReplaceAll(expression, "/", " ÷ ")
	expression = strings.ReplaceAll(expression, "-", " − ")
	expression = strings.ReplaceAll(expression, "+", " + ")
	expression = strings.ReplaceAll(expression, "  ", " ")
	return strings.TrimSpace(expression)
}
