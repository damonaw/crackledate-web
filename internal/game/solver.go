package game

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type solvedExpr struct {
	val        *big.Rat
	str        string
	unaryDepth int
}

type SearchBudget struct {
	MaxCandidateConstructions uint64
	MaxDuration               time.Duration
	CancellationCheckInterval uint64
}

var DefaultSearchBudget = SearchBudget{
	MaxCandidateConstructions: 5_000_000,
	MaxDuration:               3 * time.Second,
	CancellationCheckInterval: 1_024,
}

type SearchStats struct {
	CandidateConstructions uint64
}

var ErrNoSolution = errors.New("no solution found")
var ErrSearchBudgetExceeded = errors.New("hint search budget exceeded")

type searchState struct {
	ctx     context.Context
	budget  SearchBudget
	started time.Time
	stats   SearchStats
}

func newSearchState(ctx context.Context, budget SearchBudget) *searchState {
	return &searchState{
		ctx:     ctx,
		budget:  budget,
		started: time.Now(),
	}
}

func (state *searchState) checkLimits() error {
	if err := state.ctx.Err(); err != nil {
		return err
	}
	if state.budget.MaxDuration <= 0 || time.Since(state.started) >= state.budget.MaxDuration {
		return ErrSearchBudgetExceeded
	}
	return nil
}

func (state *searchState) attemptCandidate() error {
	if state.stats.CandidateConstructions >= state.budget.MaxCandidateConstructions {
		return ErrSearchBudgetExceeded
	}
	state.stats.CandidateConstructions++
	if state.budget.MaxDuration <= 0 || time.Since(state.started) >= state.budget.MaxDuration {
		return ErrSearchBudgetExceeded
	}
	interval := state.budget.CancellationCheckInterval
	if interval == 0 || state.stats.CandidateConstructions%interval == 0 {
		if err := state.ctx.Err(); err != nil {
			return err
		}
	}
	return nil
}

func ratNeg(val *big.Rat) *big.Rat {
	return new(big.Rat).Neg(val)
}

func ratAbs(val *big.Rat) *big.Rat {
	return new(big.Rat).Abs(val)
}

func ratSqrt(val *big.Rat) (*big.Rat, bool) {
	if val.Sign() < 0 {
		return nil, false
	}
	numeratorRoot, numeratorOK := perfectSquareRoot(val.Num())
	denominatorRoot, denominatorOK := perfectSquareRoot(val.Denom())
	if numeratorOK && denominatorOK {
		return new(big.Rat).SetFrac(numeratorRoot, denominatorRoot), true
	}
	return nil, false
}

func ratFactorial(val *big.Rat) (*big.Rat, bool) {
	if !val.IsInt() || val.Sign() < 0 {
		return nil, false
	}
	num := val.Num()
	if num.BitLen() > 16 {
		return nil, false
	}
	n := num.Int64()
	if n > 10 {
		return nil, false
	}
	res := int64(1)
	for i := int64(2); i <= n; i++ {
		res *= i
	}
	return big.NewRat(res, 1), true
}

func ratPower(base *big.Rat, exp *big.Rat) (*big.Rat, bool) {
	if !exp.IsInt() {
		return nil, false
	}
	exponent := exp.Num()
	if exponent.Sign() == 0 {
		if base.Sign() == 0 {
			return nil, false
		}
		return big.NewRat(1, 1), true
	}
	if base.Sign() == 0 {
		if exponent.Sign() < 0 {
			return nil, false
		}
		return big.NewRat(0, 1), true
	}

	absExponent := new(big.Int).Abs(exponent)
	if absExponent.Cmp(big.NewInt(10)) > 0 {
		return nil, false
	}

	negativeExponent := exponent.Sign() < 0
	if !powerIsReasonablyBounded(base, absExponent, negativeExponent) {
		return nil, false
	}

	numerator := new(big.Int).Exp(base.Num(), absExponent, nil)
	denominator := new(big.Int).Exp(base.Denom(), absExponent, nil)
	result := new(big.Rat).SetFrac(numerator, denominator)
	if negativeExponent {
		result.Inv(result)
	}
	return result, true
}

func parenthesizeIfNeeded(s string) string {
	if len(s) == 0 {
		return ""
	}
	if _, err := strconv.Atoi(s); err == nil {
		return s
	}
	if (s[0] == '(' && s[len(s)-1] == ')') || (s[0] == '|' && s[len(s)-1] == '|') {
		return s
	}
	return fmt.Sprintf("(%s)", s)
}

func getFirstSignifChar(s string) string {
	cleaned := strings.TrimLeft(s, " (")
	if len(cleaned) == 0 {
		return ""
	}
	return string([]rune(cleaned)[0])
}

func gen(digits []int, memo map[string][]solvedExpr) []solvedExpr {
	key := fmt.Sprint(digits)
	if res, ok := memo[key]; ok {
		return res
	}

	items := make([]solvedExpr, len(digits))
	for i, d := range digits {
		val := big.NewRat(int64(d), 1)
		items[i] = solvedExpr{val: val, str: strconv.Itoa(d), unaryDepth: 0}
	}
	mixedMemo := make(map[string][]solvedExpr)
	res := genMixed(items, mixedMemo)

	memo[key] = res
	return res
}

func genMixed(items []solvedExpr, memo map[string][]solvedExpr) []solvedExpr {
	key := ""
	for _, item := range items {
		key += fmt.Sprintf("[%s:%s]", item.str, item.val.String())
	}
	if res, ok := memo[key]; ok {
		return res
	}

	var results []solvedExpr

	// Case 1: Concatenation (only allowed if all items in the sub-slice are raw numbers, i.e., they have no operators in their str)
	isRawNumber := true
	for _, item := range items {
		if strings.ContainsAny(item.str, "+-*/()√!^|") {
			isRawNumber = false
			break
		}
	}
	if isRawNumber && (len(items) == 1 || items[0].str != "0") {
		numStr := ""
		for _, item := range items {
			numStr += item.str
		}
		val := new(big.Rat)
		if _, ok := val.SetString(numStr); ok {
			results = append(results, solvedExpr{val: val, str: numStr, unaryDepth: 0})
		}
	}

	// Case 2: Split and combine recursively
	for i := 1; i < len(items); i++ {
		leftExprs := genMixed(items[:i], memo)
		rightExprs := genMixed(items[i:], memo)

		for _, l := range leftExprs {
			for _, r := range rightExprs {
				// Addition
				valAdd := new(big.Rat).Add(l.val, r.val)
				results = append(results, solvedExpr{val: valAdd, str: fmt.Sprintf("(%s+%s)", l.str, r.str), unaryDepth: 0})

				// Subtraction
				valSub := new(big.Rat).Sub(l.val, r.val)
				results = append(results, solvedExpr{val: valSub, str: fmt.Sprintf("(%s-%s)", l.str, r.str), unaryDepth: 0})

				// Multiplication
				valMul := new(big.Rat).Mul(l.val, r.val)
				results = append(results, solvedExpr{val: valMul, str: fmt.Sprintf("(%s*%s)", l.str, r.str), unaryDepth: 0})

				// Division (avoid division by zero)
				if r.val.Num().Sign() != 0 {
					valDiv := new(big.Rat).Quo(l.val, r.val)
					results = append(results, solvedExpr{val: valDiv, str: fmt.Sprintf("(%s/%s)", l.str, r.str), unaryDepth: 0})
				}

				// Exponentiation
				if valPow, ok := ratPower(l.val, r.val); ok {
					results = append(results, solvedExpr{val: valPow, str: fmt.Sprintf("(%s^%s)", l.str, r.str), unaryDepth: 0})
				}
			}
		}
	}

	unique := make(map[string]solvedExpr)
	for _, item := range results {
		clean := hasCleanEnding(cleanParentheses(item.str))
		valStr := item.val.String() + "_" + strconv.FormatBool(clean)
		if existing, ok := unique[valStr]; !ok || len(item.str) < len(existing.str) {
			unique[valStr] = item
		}
	}

	finalResults := make([]solvedExpr, 0, len(unique))
	for _, item := range unique {
		finalResults = append(finalResults, item)
	}

	memo[key] = finalResults
	return finalResults
}

func genAdvanced(digits []int, memo map[string][]solvedExpr, state *searchState) ([]solvedExpr, error) {
	return genAdvancedWithUnaryLayers(digits, memo, state, 1)
}

func genAdvancedWithUnaryLayers(
	digits []int,
	memo map[string][]solvedExpr,
	state *searchState,
	maximumUnaryLayers int,
) ([]solvedExpr, error) {
	if err := state.checkLimits(); err != nil {
		return nil, err
	}
	key := fmt.Sprint(digits)
	if res, ok := memo[key]; ok {
		return res, nil
	}

	items := make([]solvedExpr, len(digits))
	for i, d := range digits {
		val := big.NewRat(int64(d), 1)
		items[i] = solvedExpr{val: val, str: strconv.Itoa(d), unaryDepth: 0}
	}
	mixedMemo := make(map[string][]solvedExpr)
	res, err := genMixedAdvancedWithUnaryLayers(items, mixedMemo, state, maximumUnaryLayers)
	if err != nil {
		return nil, err
	}

	memo[key] = res
	return res, nil
}

func genMixedAdvanced(items []solvedExpr, memo map[string][]solvedExpr, state *searchState) ([]solvedExpr, error) {
	return genMixedAdvancedWithUnaryLayers(items, memo, state, 1)
}

func genMixedAdvancedWithUnaryLayers(
	items []solvedExpr,
	memo map[string][]solvedExpr,
	state *searchState,
	maximumUnaryLayers int,
) ([]solvedExpr, error) {
	if err := state.checkLimits(); err != nil {
		return nil, err
	}
	key := ""
	for _, item := range items {
		key += fmt.Sprintf("[%s:%s:%d]", item.str, item.val.String(), item.unaryDepth)
	}
	if res, ok := memo[key]; ok {
		return res, nil
	}

	var results []solvedExpr

	// Case 1: Concatenation
	isRawNumber := true
	for _, item := range items {
		if strings.ContainsAny(item.str, "+-*/()√!^|") {
			isRawNumber = false
			break
		}
	}
	if isRawNumber && (len(items) == 1 || items[0].str != "0") {
		if err := state.attemptCandidate(); err != nil {
			return nil, err
		}
		numStr := ""
		for _, item := range items {
			numStr += item.str
		}
		val := new(big.Rat)
		if _, ok := val.SetString(numStr); ok {
			results = append(results, solvedExpr{val: val, str: numStr, unaryDepth: 0})
		}
	}

	// Case 2: Split and combine recursively
	for i := 1; i < len(items); i++ {
		leftExprs, err := genMixedAdvancedWithUnaryLayers(items[:i], memo, state, maximumUnaryLayers)
		if err != nil {
			return nil, err
		}
		rightExprs, err := genMixedAdvancedWithUnaryLayers(items[i:], memo, state, maximumUnaryLayers)
		if err != nil {
			return nil, err
		}

		for _, l := range leftExprs {
			for _, r := range rightExprs {
				// Addition
				if err := state.attemptCandidate(); err != nil {
					return nil, err
				}
				valAdd := new(big.Rat).Add(l.val, r.val)
				results = append(results, solvedExpr{val: valAdd, str: fmt.Sprintf("(%s+%s)", l.str, r.str), unaryDepth: 0})

				// Subtraction
				if err := state.attemptCandidate(); err != nil {
					return nil, err
				}
				valSub := new(big.Rat).Sub(l.val, r.val)
				results = append(results, solvedExpr{val: valSub, str: fmt.Sprintf("(%s-%s)", l.str, r.str), unaryDepth: 0})

				// Multiplication
				if err := state.attemptCandidate(); err != nil {
					return nil, err
				}
				valMul := new(big.Rat).Mul(l.val, r.val)
				results = append(results, solvedExpr{val: valMul, str: fmt.Sprintf("(%s*%s)", l.str, r.str), unaryDepth: 0})

				// Division (avoid division by zero)
				if err := state.attemptCandidate(); err != nil {
					return nil, err
				}
				if r.val.Num().Sign() != 0 {
					valDiv := new(big.Rat).Quo(l.val, r.val)
					results = append(results, solvedExpr{val: valDiv, str: fmt.Sprintf("(%s/%s)", l.str, r.str), unaryDepth: 0})
				}

				// Exponentiation
				if err := state.attemptCandidate(); err != nil {
					return nil, err
				}
				if valPow, ok := ratPower(l.val, r.val); ok {
					results = append(results, solvedExpr{val: valPow, str: fmt.Sprintf("(%s^%s)", l.str, r.str), unaryDepth: 0})
				}
			}
		}
	}

	allResults := append([]solvedExpr(nil), results...)
	frontier := results
	for unaryLayer := 0; unaryLayer < maximumUnaryLayers && len(frontier) > 0; unaryLayer++ {
		unaryResults, err := applyUnaryAdvanced(frontier, state)
		if err != nil {
			return nil, err
		}
		allResults = append(allResults, unaryResults...)
		frontier = unaryResults
	}

	finalResults, err := deduplicateAdvanced(allResults, state)
	if err != nil {
		return nil, err
	}
	memo[key] = finalResults
	return finalResults, nil
}

func applyUnaryAdvanced(items []solvedExpr, state *searchState) ([]solvedExpr, error) {
	results := make([]solvedExpr, 0, len(items)*3)
	for _, item := range items {
		if item.unaryDepth >= 2 {
			continue
		}

		if err := state.attemptCandidate(); err != nil {
			return nil, err
		}
		results = append(results, solvedExpr{
			val:        ratNeg(item.val),
			str:        fmt.Sprintf("-%s", parenthesizeIfNeeded(item.str)),
			unaryDepth: item.unaryDepth + 1,
		})

		if err := state.attemptCandidate(); err != nil {
			return nil, err
		}
		if value, ok := ratSqrt(item.val); ok {
			results = append(results, solvedExpr{
				val:        value,
				str:        fmt.Sprintf("√%s", parenthesizeIfNeeded(item.str)),
				unaryDepth: item.unaryDepth + 1,
			})
		}

		if err := state.attemptCandidate(); err != nil {
			return nil, err
		}
		if value, ok := ratFactorial(item.val); ok {
			results = append(results, solvedExpr{
				val:        value,
				str:        fmt.Sprintf("%s!", parenthesizeIfNeeded(item.str)),
				unaryDepth: item.unaryDepth + 1,
			})
		}

		if err := state.attemptCandidate(); err != nil {
			return nil, err
		}
		results = append(results, solvedExpr{
			val:        ratAbs(item.val),
			str:        fmt.Sprintf("|%s|", item.str),
			unaryDepth: item.unaryDepth + 1,
		})
	}
	return results, nil
}

func deduplicateAdvanced(items []solvedExpr, state *searchState) ([]solvedExpr, error) {
	unique := make(map[string]solvedExpr)
	orderedKeys := make([]string, 0, len(items))
	for index, item := range items {
		if index%1_024 == 0 {
			if err := state.checkLimits(); err != nil {
				return nil, err
			}
		}
		sigChar := getFirstSignifChar(item.str)
		clean := hasCleanEnding(cleanParentheses(item.str))
		valStr := item.val.String() + "_" + sigChar + "_" + strconv.FormatBool(clean)
		existing, ok := unique[valStr]
		if !ok {
			orderedKeys = append(orderedKeys, valStr)
			unique[valStr] = item
			continue
		}
		itemLength := utf8.RuneCountInString(item.str)
		existingLength := utf8.RuneCountInString(existing.str)
		if itemLength < existingLength || (itemLength == existingLength && item.str < existing.str) {
			unique[valStr] = item
		}
	}

	finalResults := make([]solvedExpr, 0, len(orderedKeys))
	for _, orderedKey := range orderedKeys {
		finalResults = append(finalResults, unique[orderedKey])
	}
	return finalResults, nil
}

func normalizeEquation(eq string) string {
	r := strings.NewReplacer("×", "*", "÷", "/", "−", "-", " ", "")
	return r.Replace(eq)
}

func hasPrefixIgnoreParentheses(sol, normPrefix string) bool {
	normSol := normalizeEquation(sol)
	cleanSol := strings.ReplaceAll(strings.ReplaceAll(normSol, "(", ""), ")", "")
	cleanPrefix := strings.ReplaceAll(strings.ReplaceAll(normPrefix, "(", ""), ")", "")
	return strings.HasPrefix(cleanSol, cleanPrefix)
}

// SolvePuzzle keeps the legacy server callback shape while hint callers migrate
// to the context-aware, budgeted solver.
func SolvePuzzle(digits []int, mode string, targetValue string, prefix string) (string, error) {
	solution, _, err := SolvePuzzleWithBudget(
		context.Background(),
		digits,
		mode,
		targetValue,
		prefix,
		DefaultSearchBudget,
	)
	return solution, err
}

func SolvePuzzleWithBudget(
	ctx context.Context,
	digits []int,
	mode string,
	targetValue string,
	prefix string,
	budget SearchBudget,
) (string, SearchStats, error) {
	if mode != "classic" {
		return "", SearchStats{}, errors.New("hint mode must be classic")
	}
	if len(digits) == 0 {
		return "", SearchStats{}, errors.New("digits slice cannot be empty")
	}
	for _, digit := range digits {
		if digit < 0 || digit > 9 {
			return "", SearchStats{}, errors.New("hint digits must be between 0 and 9")
		}
	}
	_ = targetValue

	state := newSearchState(ctx, budget)
	if err := state.checkLimits(); err != nil {
		return "", state.stats, err
	}

	normalizedPrefix := normalizeEquation(prefix)
	if strings.Contains(prefix, "=") && ValidateEquation(prefix, digits, "classic", "").Valid {
		return prefix, state.stats, nil
	}
	if normalizedPrefix != "" && !strings.Contains(prefix, "=") {
		completed, found, err := completeEvaluableLHSWithBase(digits, prefix, state)
		if err != nil {
			return "", state.stats, err
		}
		if found {
			return completed, state.stats, nil
		}
	}
	memo := make(map[string][]solvedExpr)
	var firstCompatible string
	var firstCompatibleClean string
	firstSplit := 1
	lastSplit := len(digits) - 1
	if normalizedPrefix != "" {
		leftPrefix := strings.SplitN(prefix, "=", 2)[0]
		prefixDigitCount := countDigits(leftPrefix)
		if prefixDigitCount > firstSplit {
			firstSplit = prefixDigitCount
		}
		if strings.Contains(prefix, "=") {
			lastSplit = prefixDigitCount
		}
	}
	if firstSplit <= lastSplit {
		baseClean, found, err := findBaseCleanCandidate(
			digits,
			firstSplit,
			prefix,
			normalizedPrefix,
			state,
		)
		if err != nil {
			return "", state.stats, err
		}
		if found {
			return baseClean, state.stats, nil
		}
	}

	for split := firstSplit; split <= lastSplit; split++ {
		if err := state.checkLimits(); err != nil {
			return "", state.stats, err
		}
		leftExpressions, err := genAdvanced(digits[:split], memo, state)
		if err != nil {
			return "", state.stats, err
		}
		rightExpressions, err := genAdvanced(digits[split:], memo, state)
		if err != nil {
			return "", state.stats, err
		}

		var comparisons uint64
		for _, left := range leftExpressions {
			for _, right := range rightExpressions {
				if comparisons%1_024 == 0 {
					if err := state.checkLimits(); err != nil {
						return "", state.stats, err
					}
				}
				comparisons++
				if left.val.Cmp(right.val) != 0 {
					continue
				}
				equation := fmt.Sprintf(
					"%s=%s",
					cleanParentheses(left.str),
					cleanParentheses(right.str),
				)
				if !ValidateEquation(equation, digits, "classic", "").Valid {
					continue
				}
				if normalizedPrefix != "" && !hasPrefixIgnoreParentheses(equation, normalizedPrefix) {
					continue
				}
				if firstCompatible == "" {
					firstCompatible = equation
				}
				if firstCompatibleClean == "" && hasCleanEnding(cleanParentheses(right.str)) {
					firstCompatibleClean = equation
					return firstCompatibleClean, state.stats, nil
				}
			}
		}
	}

	if err := state.checkLimits(); err != nil {
		return "", state.stats, err
	}
	if firstCompatibleClean != "" {
		return firstCompatibleClean, state.stats, nil
	}
	if firstCompatible != "" {
		return firstCompatible, state.stats, nil
	}
	return "", state.stats, ErrNoSolution
}

func completeEvaluableLHSWithBase(
	digits []int,
	prefix string,
	state *searchState,
) (string, bool, error) {
	usedDigits := countDigits(prefix)
	if usedDigits == 0 || usedDigits >= len(digits) || !digitsMatch(prefix, digits[:usedDigits]) {
		return "", false, nil
	}
	evaluated, err := Evaluate(prefix)
	if err != nil || evaluated.rat == nil {
		return "", false, nil
	}

	rightExpressions, err := genAdvancedWithUnaryLayers(
		digits[usedDigits:],
		make(map[string][]solvedExpr),
		state,
		0,
	)
	if err != nil {
		return "", false, err
	}
	for index, right := range rightExpressions {
		if index%1_024 == 0 {
			if err := state.checkLimits(); err != nil {
				return "", false, err
			}
		}
		if evaluated.rat.Cmp(right.val) != 0 {
			continue
		}
		rightText := cleanParentheses(right.str)
		equation := prefix + "=" + rightText
		if hasCleanEnding(rightText) && ValidateEquation(equation, digits, "classic", "").Valid {
			return equation, true, nil
		}
	}
	return "", false, nil
}

func findBaseCleanCandidate(
	digits []int,
	split int,
	prefix string,
	normalizedPrefix string,
	state *searchState,
) (string, bool, error) {
	memo := make(map[string][]solvedExpr)
	leftExpressions, err := genAdvancedWithUnaryLayers(digits[:split], memo, state, 0)
	if err != nil {
		return "", false, err
	}
	rightExpressions, err := genAdvancedWithUnaryLayers(digits[split:], memo, state, 0)
	if err != nil {
		return "", false, err
	}

	for _, left := range leftExpressions {
		leftText := cleanParentheses(left.str)
		if !leftCouldMatchPrefix(leftText, prefix, normalizedPrefix) {
			continue
		}
		for index, right := range rightExpressions {
			if index%1_024 == 0 {
				if err := state.checkLimits(); err != nil {
					return "", false, err
				}
			}
			if left.val.Cmp(right.val) != 0 {
				continue
			}
			rightText := cleanParentheses(right.str)
			equation := leftText + "=" + rightText
			if normalizedPrefix != "" && !hasPrefixIgnoreParentheses(equation, normalizedPrefix) {
				continue
			}
			if !hasCleanEnding(rightText) || !ValidateEquation(equation, digits, "classic", "").Valid {
				continue
			}
			return equation, true, nil
		}
		// Unary right-side candidates for this first compatible left precede
		// every later left expression, so a later base candidate cannot yet win.
		return "", false, nil
	}
	return "", false, nil
}

func leftCouldMatchPrefix(left string, prefix string, normalizedPrefix string) bool {
	if normalizedPrefix == "" {
		return true
	}
	leftNormalized := strings.ReplaceAll(strings.ReplaceAll(normalizeEquation(left), "(", ""), ")", "")
	if strings.Contains(prefix, "=") {
		prefixLeft := strings.SplitN(prefix, "=", 2)[0]
		prefixLeft = strings.ReplaceAll(strings.ReplaceAll(normalizeEquation(prefixLeft), "(", ""), ")", "")
		return leftNormalized == prefixLeft
	}
	prefixNormalized := strings.ReplaceAll(strings.ReplaceAll(normalizedPrefix, "(", ""), ")", "")
	return strings.HasPrefix(leftNormalized, prefixNormalized)
}

func cleanParentheses(s string) string {
	if len(s) > 1 && s[0] == '(' && s[len(s)-1] == ')' {
		depth := 0
		ok := true
		for i := 0; i < len(s)-1; i++ {
			if s[i] == '(' {
				depth++
			} else if s[i] == ')' {
				depth--
				if depth == 0 {
					ok = false
					break
				}
			}
		}
		if ok {
			return cleanParentheses(s[1 : len(s)-1])
		}
	}
	return s
}

func countDigits(s string) int {
	count := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			count++
		}
	}
	return count
}

func hasCleanEnding(rhs string) bool {
	rhs = strings.ReplaceAll(rhs, " ", "")
	rhs = stripOuterParentheses(rhs)
	lastOpIdx := findLastTopLevelOperator(rhs)
	if lastOpIdx == -1 {
		return false
	}
	suffixExpr := rhs[lastOpIdx+1:]
	return countDigits(suffixExpr) == 1
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
			if r == '+' || r == '*' || r == '/' || r == '^' || (r == '-' && isBinaryMinus(s, i)) {
				lastOpIdx = i
			}
		}
	}
	return lastOpIdx
}

func isBinaryMinus(expression string, index int) bool {
	if index == 0 {
		return false
	}
	previous := expression[index-1]
	if previous >= '0' && previous <= '9' || previous == ')' || previous == '!' {
		return true
	}
	return previous == '|' && strings.Count(expression[:index], "|")%2 == 0
}
