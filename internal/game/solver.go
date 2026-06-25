package game

import (
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
)

type solvedExpr struct {
	val        *big.Rat
	str        string
	unaryDepth int
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

func genAdvanced(digits []int, memo map[string][]solvedExpr) []solvedExpr {
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
	res := genMixedAdvanced(items, mixedMemo)

	memo[key] = res
	return res
}

func genMixedAdvanced(items []solvedExpr, memo map[string][]solvedExpr) []solvedExpr {
	key := ""
	for _, item := range items {
		key += fmt.Sprintf("[%s:%s:%d]", item.str, item.val.String(), item.unaryDepth)
	}
	if res, ok := memo[key]; ok {
		return res
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
		leftExprs := genMixedAdvanced(items[:i], memo)
		rightExprs := genMixedAdvanced(items[i:], memo)

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

	// Case 3: Apply unary operators to the generated expressions
	var unaryResults []solvedExpr
	for _, item := range results {
		if item.unaryDepth < 2 {
			// Negation
			valNeg := ratNeg(item.val)
			unaryResults = append(unaryResults, solvedExpr{
				val:        valNeg,
				str:        fmt.Sprintf("-%s", parenthesizeIfNeeded(item.str)),
				unaryDepth: item.unaryDepth + 1,
			})

			// Square root
			if valSqrt, ok := ratSqrt(item.val); ok {
				unaryResults = append(unaryResults, solvedExpr{
					val:        valSqrt,
					str:        fmt.Sprintf("√%s", parenthesizeIfNeeded(item.str)),
					unaryDepth: item.unaryDepth + 1,
				})
			}

			// Factorial
			if valFact, ok := ratFactorial(item.val); ok {
				unaryResults = append(unaryResults, solvedExpr{
					val:        valFact,
					str:        fmt.Sprintf("%s!", parenthesizeIfNeeded(item.str)),
					unaryDepth: item.unaryDepth + 1,
				})
			}

			// Absolute value
			unaryResults = append(unaryResults, solvedExpr{
				val:        ratAbs(item.val),
				str:        fmt.Sprintf("|%s|", item.str),
				unaryDepth: item.unaryDepth + 1,
			})
		}
	}
	results = append(results, unaryResults...)

	unique := make(map[string]solvedExpr)
	for _, item := range results {
		sigChar := getFirstSignifChar(item.str)
		clean := hasCleanEnding(cleanParentheses(item.str))
		valStr := item.val.String() + "_" + sigChar + "_" + strconv.FormatBool(clean)
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

// SolvePuzzle finds a solution for the given digits according to the game mode, trying to match the prefix first.
func SolvePuzzle(digits []int, mode string, targetValue string, prefix string) (string, error) {
	if len(digits) == 0 {
		return "", errors.New("digits slice cannot be empty")
	}

	normPrefix := normalizeEquation(prefix)
	memo := make(map[string][]solvedExpr)

	if normPrefix != "" {
		if completed, err := solveWithSmartPrefix(digits, mode, targetValue, prefix); err == nil && completed != "" {
			return completed, nil
		}
	}

	if normPrefix != "" {
		switch mode {
		case "double_equality":
			if len(digits) >= 3 {
				for i := 1; i < len(digits)-1; i++ {
					for j := i + 1; j < len(digits); j++ {
						left := gen(digits[:i], memo)
						middle := gen(digits[i:j], memo)
						right := gen(digits[j:], memo)

						for _, l := range left {
							for _, m := range middle {
								if l.val.Cmp(m.val) == 0 {
									for _, r := range right {
										if m.val.Cmp(r.val) == 0 {
											sol := fmt.Sprintf("%s=%s=%s", cleanParentheses(l.str), cleanParentheses(m.str), cleanParentheses(r.str))
											if hasPrefixIgnoreParentheses(sol, normPrefix) {
												return sol, nil
											}
										}
									}
								}
							}
						}
					}
				}
			}

		case "target":
			targetVal := new(big.Rat)
			if _, ok := targetVal.SetString(targetValue); ok {
				for i := 1; i < len(digits); i++ {
					left := gen(digits[:i], memo)
					right := gen(digits[i:], memo)

					for _, l := range left {
						if l.val.Cmp(targetVal) == 0 {
							for _, r := range right {
								if r.val.Cmp(targetVal) == 0 {
									sol := fmt.Sprintf("%s=%s", cleanParentheses(l.str), cleanParentheses(r.str))
									if hasPrefixIgnoreParentheses(sol, normPrefix) {
										return sol, nil
									}
								}
							}
						}
					}
				}
			}

		case "single_expr":
			targetVal := new(big.Rat)
			if _, ok := targetVal.SetString(targetValue); ok {
				allExprs := gen(digits, memo)
				for _, expr := range allExprs {
					if expr.val.Cmp(targetVal) == 0 {
						sol := cleanParentheses(expr.str)
						if hasPrefixIgnoreParentheses(sol, normPrefix) {
							return sol, nil
						}
					}
				}
			}

		default: // classic
			var fallback string
			for i := 1; i < len(digits); i++ {
				left := gen(digits[:i], memo)
				right := gen(digits[i:], memo)

				for _, l := range left {
					for _, r := range right {
						if l.val.Cmp(r.val) == 0 {
							sol := fmt.Sprintf("%s=%s", cleanParentheses(l.str), cleanParentheses(r.str))
							if hasPrefixIgnoreParentheses(sol, normPrefix) {
								if hasCleanEnding(cleanParentheses(r.str)) {
									return sol, nil
								}
								if fallback == "" {
									fallback = sol
								}
							}
						}
					}
				}
			}
			if fallback != "" {
				return fallback, nil
			}
		}
		return "", fmt.Errorf("no solution found starting with prefix: %s", prefix)
	}

	// Default fallback (no prefix)
	switch mode {
	case "double_equality":
		if len(digits) < 3 {
			return "", errors.New("double equality requires at least 3 digits")
		}
		for i := 1; i < len(digits)-1; i++ {
			for j := i + 1; j < len(digits); j++ {
				left := gen(digits[:i], memo)
				middle := gen(digits[i:j], memo)
				right := gen(digits[j:], memo)

				for _, l := range left {
					for _, m := range middle {
						if l.val.Cmp(m.val) == 0 {
							for _, r := range right {
								if m.val.Cmp(r.val) == 0 {
									return fmt.Sprintf("%s=%s=%s", cleanParentheses(l.str), cleanParentheses(m.str), cleanParentheses(r.str)), nil
								}
							}
						}
					}
				}
			}
		}

	case "target":
		targetVal := new(big.Rat)
		if _, ok := targetVal.SetString(targetValue); !ok {
			return "", fmt.Errorf("invalid target value: %s", targetValue)
		}
		var fallback string
		for i := 1; i < len(digits); i++ {
			left := gen(digits[:i], memo)
			right := gen(digits[i:], memo)

			for _, l := range left {
				if l.val.Cmp(targetVal) == 0 {
					for _, r := range right {
						if r.val.Cmp(targetVal) == 0 {
							solCandidate := fmt.Sprintf("%s=%s", cleanParentheses(l.str), cleanParentheses(r.str))
							if hasCleanEnding(cleanParentheses(r.str)) {
								return solCandidate, nil
							}
							if fallback == "" {
								fallback = solCandidate
							}
						}
					}
				}
			}
		}
		if fallback != "" {
			return fallback, nil
		}

	case "single_expr":
		targetVal := new(big.Rat)
		if _, ok := targetVal.SetString(targetValue); !ok {
			return "", fmt.Errorf("invalid target value: %s", targetValue)
		}
		allExprs := gen(digits, memo)
		for _, expr := range allExprs {
			if expr.val.Cmp(targetVal) == 0 {
				return cleanParentheses(expr.str), nil
			}
		}

	default: // classic
		var fallback string
		for i := 1; i < len(digits); i++ {
			left := gen(digits[:i], memo)
			right := gen(digits[i:], memo)

			for _, l := range left {
				for _, r := range right {
					if l.val.Cmp(r.val) == 0 {
						solCandidate := fmt.Sprintf("%s=%s", cleanParentheses(l.str), cleanParentheses(r.str))
						if hasCleanEnding(cleanParentheses(r.str)) {
							return solCandidate, nil
						}
						if fallback == "" {
							fallback = solCandidate
						}
					}
				}
			}
		}
		if fallback != "" {
			return fallback, nil
		}
	}

	return "", errors.New("no solution found")
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

func evaluateToRat(expression string) (*big.Rat, error) {
	num, err := Evaluate(expression)
	if err != nil {
		return nil, err
	}
	if num.rat != nil {
		return num.rat, nil
	}
	if num.float != nil {
		ratVal := new(big.Rat)
		num.float.Rat(ratVal)
		return ratVal, nil
	}
	return nil, errors.New("invalid number value")
}

func solveWithSmartPrefix(digits []int, mode string, targetValue string, prefix string) (string, error) {
	memo := make(map[string][]solvedExpr)

	if mode == "single_expr" {
		valTarget := new(big.Rat)
		if _, ok := valTarget.SetString(targetValue); !ok {
			return "", errors.New("invalid target value")
		}

		valPrefix, err := evaluateToRat(prefix)
		if err != nil {
			return "", err
		}

		numDigitsUsed := countDigits(prefix)
		if numDigitsUsed >= len(digits) {
			return "", errors.New("all digits already used")
		}

		firstExpr := solvedExpr{val: valPrefix, str: prefix}
		remainingDigits := digits[numDigitsUsed:]

		items := make([]solvedExpr, len(remainingDigits)+1)
		items[0] = firstExpr
		for i, d := range remainingDigits {
			items[i+1] = solvedExpr{val: big.NewRat(int64(d), 1), str: strconv.Itoa(d)}
		}

		mixedMemo := make(map[string][]solvedExpr)
		results := genMixedAdvanced(items, mixedMemo)
		for _, r := range results {
			if r.val.Cmp(valTarget) == 0 {
				return cleanParentheses(r.str), nil
			}
		}
		return "", errors.New("no solution found")
	}

	parts := strings.Split(prefix, "=")

	switch mode {
	case "classic", "target":
		var valTarget *big.Rat
		if mode == "target" {
			valTarget = new(big.Rat)
			if _, ok := valTarget.SetString(targetValue); !ok {
				return "", errors.New("invalid target value")
			}
		}

		if len(parts) == 1 {
			valLHS, err := evaluateToRat(parts[0])
			if err != nil {
				return "", err
			}
			if valTarget != nil && valLHS.Cmp(valTarget) != 0 {
				return "", errors.New("LHS value does not match target")
			}

			numDigitsUsed := countDigits(parts[0])
			if numDigitsUsed >= len(digits) {
				return "", errors.New("all digits used on LHS")
			}

			remainingDigits := digits[numDigitsUsed:]
			rhsExprs := genAdvanced(remainingDigits, memo)

			targetRHS := valLHS
			if valTarget != nil {
				targetRHS = valTarget
			}

			var fallback string
			for _, r := range rhsExprs {
				if r.val.Cmp(targetRHS) == 0 {
					solCandidate := fmt.Sprintf("%s=%s", parts[0], cleanParentheses(r.str))
					if hasCleanEnding(cleanParentheses(r.str)) {
						return solCandidate, nil
					}
					if fallback == "" {
						fallback = solCandidate
					}
				}
			}
			if fallback != "" {
				return fallback, nil
			}
		} else if len(parts) == 2 {
			valLHS, err := evaluateToRat(parts[0])
			if err != nil {
				return "", err
			}
			if valTarget != nil && valLHS.Cmp(valTarget) != 0 {
				return "", errors.New("LHS value does not match target")
			}

			numDigitsLHS := countDigits(parts[0])
			normRHS := normalizeEquation(parts[1])

			remainingDigits := digits[numDigitsLHS:]
			rhsExprs := genAdvanced(remainingDigits, memo)

			targetRHS := valLHS
			if valTarget != nil {
				targetRHS = valTarget
			}

			var fallback string
			for _, r := range rhsExprs {
				if r.val.Cmp(targetRHS) == 0 {
					if hasPrefixIgnoreParentheses(r.str, normRHS) {
						solCandidate := fmt.Sprintf("%s=%s", parts[0], cleanParentheses(r.str))
						if hasCleanEnding(cleanParentheses(r.str)) {
							return solCandidate, nil
						}
						if fallback == "" {
							fallback = solCandidate
						}
					}
				}
			}
			if fallback != "" {
				return fallback, nil
			}
		}

	case "double_equality":
		if len(parts) == 1 {
			valLHS, err := evaluateToRat(parts[0])
			if err != nil {
				return "", err
			}
			numDigitsLHS := countDigits(parts[0])
			remainingDigits := digits[numDigitsLHS:]

			if len(remainingDigits) >= 2 {
				for i := 1; i < len(remainingDigits); i++ {
					middle := genAdvanced(remainingDigits[:i], memo)
					right := genAdvanced(remainingDigits[i:], memo)
					for _, m := range middle {
						if m.val.Cmp(valLHS) == 0 {
							for _, r := range right {
								if r.val.Cmp(valLHS) == 0 {
									return fmt.Sprintf("%s=%s=%s", parts[0], cleanParentheses(m.str), cleanParentheses(r.str)), nil
								}
							}
						}
					}
				}
			}
		} else if len(parts) == 2 {
			valLHS, err := evaluateToRat(parts[0])
			if err != nil {
				return "", err
			}
			numDigitsLHS := countDigits(parts[0])
			remainingDigits := digits[numDigitsLHS:]
			normMiddle := normalizeEquation(parts[1])

			if len(remainingDigits) >= 2 {
				for i := 1; i < len(remainingDigits); i++ {
					middle := genAdvanced(remainingDigits[:i], memo)
					right := genAdvanced(remainingDigits[i:], memo)
					for _, m := range middle {
						if m.val.Cmp(valLHS) == 0 {
							if hasPrefixIgnoreParentheses(m.str, normMiddle) {
								for _, r := range right {
									if r.val.Cmp(valLHS) == 0 {
										return fmt.Sprintf("%s=%s=%s", parts[0], cleanParentheses(m.str), cleanParentheses(r.str)), nil
									}
								}
							}
						}
					}
				}
			}
		} else if len(parts) == 3 {
			valLHS, err := evaluateToRat(parts[0])
			if err != nil {
				return "", err
			}
			valMiddle, err := evaluateToRat(parts[1])
			if err != nil {
				return "", err
			}
			if valLHS.Cmp(valMiddle) != 0 {
				return "", errors.New("LHS and Middle values do not match")
			}

			numDigitsLHS := countDigits(parts[0])
			numDigitsMiddle := countDigits(parts[1])
			remainingDigits := digits[numDigitsLHS+numDigitsMiddle:]
			normRHS := normalizeEquation(parts[2])

			rightExprs := genAdvanced(remainingDigits, memo)
			for _, r := range rightExprs {
				if r.val.Cmp(valLHS) == 0 {
					if hasPrefixIgnoreParentheses(r.str, normRHS) {
						return fmt.Sprintf("%s=%s=%s", parts[0], parts[1], cleanParentheses(r.str)), nil
					}
				}
			}
		}
	}

	return "", errors.New("no solution found")
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
			if r == '+' || r == '-' || r == '*' || r == '/' || r == '^' {
				lastOpIdx = i
			}
		}
	}
	return lastOpIdx
}

