package game

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
	"unicode"
)

const tolerance = 1e-10
const bigFloatPrecision = 256
const decimalDisplayPlaces = 12
const plainIntegerDisplayDigits = 24
const maximumMagnitudeDigits = 120
const maximumComponentDigits = 512
const maximumRepeatingDecimalDigits = 128

const combiningOverline = "\u0305"

var (
	errUnexpectedEnd = errors.New("unexpected end of expression")
	errUnexpected    = errors.New("unexpected token")
	errNumberLarge   = errors.New("calculated number is too large")
)

type number struct {
	rat   *big.Rat
	float *big.Float
}

type tokenKind int

const (
	tokenNumber tokenKind = iota
	tokenOperator
	tokenEquals
)

type token struct {
	kind  tokenKind
	text  string
	value number
}

func Evaluate(expression string) (number, error) {
	tokens, err := lex(expression)
	if err != nil {
		return zeroNumber(), err
	}
	if len(tokens) == 0 {
		return zeroNumber(), errors.New("empty expression")
	}
	parser := expressionParser{tokens: tokens}
	value, err := parser.parseExpression()
	if err != nil {
		return zeroNumber(), err
	}
	if parser.index < len(tokens) {
		return zeroNumber(), fmt.Errorf("%w: %s", errUnexpected, tokens[parser.index].text)
	}
	return checked(value)
}

func lex(input string) ([]token, error) {
	tokens := make([]token, 0, len(input))
	runes := []rune(input)
	for index := 0; index < len(runes); {
		char := runes[index]
		if unicode.IsSpace(char) {
			index++
			continue
		}
		if unicode.IsDigit(char) {
			start := index
			for index < len(runes) && unicode.IsDigit(runes[index]) {
				index++
			}
			text := string(runes[start:index])
			if len(text) > 1 && strings.HasPrefix(text, "0") {
				return nil, fmt.Errorf("invalid number %s", text)
			}
			value := new(big.Int)
			if _, ok := value.SetString(text, 10); !ok {
				return nil, errNumberLarge
			}
			numberValue, err := checked(numberFromInt(value))
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, token{kind: tokenNumber, text: text, value: numberValue})
			continue
		}

		switch char {
		case '+', '-', '*', '×', 'x', 'X', '/', '÷', '^', '√', '!', '(', ')', '|':
			tokens = append(tokens, token{kind: tokenOperator, text: string(char)})
		case '=':
			tokens = append(tokens, token{kind: tokenEquals, text: string(char)})
		default:
			return nil, fmt.Errorf("unexpected character %q", char)
		}
		index++
	}
	return tokens, nil
}

type expressionParser struct {
	tokens []token
	index  int
}

func (parser *expressionParser) parseExpression() (number, error) {
	return parser.parseExpressionUntil(nil)
}

func (parser *expressionParser) parseExpressionUntil(stopOperators map[string]struct{}) (number, error) {
	result, err := parser.parseTerm(stopOperators)
	if err != nil {
		return zeroNumber(), err
	}

	for !parser.isAtStop(stopOperators) && (parser.matchOperator("+") || parser.matchOperator("-")) {
		operation := parser.previous().text
		right, err := parser.parseTerm(stopOperators)
		if err != nil {
			return zeroNumber(), err
		}
		if operation == "+" {
			result, err = addNumbers(result, right)
		} else {
			result, err = subtractNumbers(result, right)
		}
		if err != nil {
			return zeroNumber(), err
		}
	}
	return result, nil
}

func (parser *expressionParser) parseTerm(stopOperators map[string]struct{}) (number, error) {
	result, err := parser.parsePower(stopOperators)
	if err != nil {
		return zeroNumber(), err
	}

	for !parser.isAtStop(stopOperators) {
		if parser.matchOperator("*") || parser.matchOperator("×") || parser.matchOperator("x") || parser.matchOperator("X") {
			right, err := parser.parsePower(stopOperators)
			if err != nil {
				return zeroNumber(), err
			}
			result, err = multiplyNumbers(result, right)
		} else if parser.matchOperator("/") || parser.matchOperator("÷") {
			right, err := parser.parsePower(stopOperators)
			if err != nil {
				return zeroNumber(), err
			}
			result, err = divideNumbers(result, right)
		} else if parser.startsImplicitMultiplication(stopOperators) {
			right, err := parser.parsePower(stopOperators)
			if err != nil {
				return zeroNumber(), err
			}
			result, err = multiplyNumbers(result, right)
		} else {
			break
		}
		if err != nil {
			return zeroNumber(), err
		}
	}
	return result, nil
}

func (parser *expressionParser) parsePower(stopOperators map[string]struct{}) (number, error) {
	left, err := parser.parseUnary(stopOperators)
	if err != nil {
		return zeroNumber(), err
	}
	if !parser.isAtStop(stopOperators) && parser.matchOperator("^") {
		right, err := parser.parsePower(stopOperators)
		if err != nil {
			return zeroNumber(), err
		}
		return powerNumbers(left, right)
	}
	return left, nil
}

func (parser *expressionParser) parseUnary(stopOperators map[string]struct{}) (number, error) {
	if parser.matchOperator("-") {
		value, err := parser.parseUnary(stopOperators)
		if err != nil {
			return zeroNumber(), err
		}
		return negateNumber(value)
	}
	if parser.matchOperator("√") {
		value, err := parser.parseUnary(stopOperators)
		if err != nil {
			return zeroNumber(), err
		}
		return sqrtNumber(value)
	}
	return parser.parsePostfix(stopOperators)
}

func (parser *expressionParser) parsePostfix(stopOperators map[string]struct{}) (number, error) {
	result, err := parser.parsePrimary(stopOperators)
	if err != nil {
		return zeroNumber(), err
	}
	for !parser.isAtStop(stopOperators) && parser.matchOperator("!") {
		result, err = factorialNumber(result)
		if err != nil {
			return zeroNumber(), err
		}
	}
	return checked(result)
}

func (parser *expressionParser) parsePrimary(stopOperators map[string]struct{}) (number, error) {
	if parser.isAtEnd() {
		return zeroNumber(), errUnexpectedEnd
	}
	if parser.isAtStop(stopOperators) {
		return zeroNumber(), errUnexpectedEnd
	}
	if parser.matchKind(tokenNumber) {
		return parser.previous().value.clone(), nil
	}
	if parser.matchOperator("(") {
		value, err := parser.parseExpressionUntil(stopSet(")"))
		if err != nil {
			return zeroNumber(), err
		}
		if !parser.matchOperator(")") {
			return zeroNumber(), errors.New("missing closing parenthesis")
		}
		return value, nil
	}
	if parser.matchOperator("|") {
		value, err := parser.parseExpressionUntil(stopSet("|"))
		if err != nil {
			return zeroNumber(), err
		}
		if !parser.matchOperator("|") {
			return zeroNumber(), errors.New("missing closing absolute value")
		}
		return absNumber(value)
	}
	return zeroNumber(), fmt.Errorf("%w: %s", errUnexpected, parser.peek().text)
}

func (parser *expressionParser) startsImplicitMultiplication(stopOperators map[string]struct{}) bool {
	if parser.isAtEnd() || parser.isAtStop(stopOperators) {
		return false
	}
	current := parser.peek()
	if current.kind == tokenNumber {
		return true
	}
	if current.kind != tokenOperator {
		return false
	}
	return current.text == "(" || current.text == "|" || current.text == "√"
}

func stopSet(operators ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(operators))
	for _, operator := range operators {
		result[operator] = struct{}{}
	}
	return result
}

func (parser *expressionParser) isAtStop(stopOperators map[string]struct{}) bool {
	if parser.isAtEnd() || len(stopOperators) == 0 {
		return false
	}
	current := parser.peek()
	if current.kind != tokenOperator {
		return false
	}
	_, shouldStop := stopOperators[current.text]
	return shouldStop
}

func (parser *expressionParser) matchKind(kind tokenKind) bool {
	if parser.isAtEnd() || parser.peek().kind != kind {
		return false
	}
	parser.index++
	return true
}

func (parser *expressionParser) matchOperator(operator string) bool {
	if parser.isAtEnd() {
		return false
	}
	current := parser.peek()
	if current.kind != tokenOperator || current.text != operator {
		return false
	}
	parser.index++
	return true
}

func (parser *expressionParser) previous() token {
	return parser.tokens[parser.index-1]
}

func (parser *expressionParser) peek() token {
	return parser.tokens[parser.index]
}

func (parser *expressionParser) isAtEnd() bool {
	return parser.index >= len(parser.tokens)
}

func zeroNumber() number {
	return numberFromInt64(0)
}

func numberFromInt64(value int64) number {
	return number{rat: new(big.Rat).SetInt64(value)}
}

func numberFromInt(value *big.Int) number {
	return number{rat: new(big.Rat).SetInt(value)}
}

func numberFromRat(value *big.Rat) number {
	return number{rat: new(big.Rat).Set(value)}
}

func numberFromFloat(value *big.Float) number {
	return number{float: new(big.Float).SetPrec(bigFloatPrecision).Set(value)}
}

func (value number) clone() number {
	if value.rat != nil {
		return numberFromRat(value.rat)
	}
	if value.float != nil {
		return numberFromFloat(value.float)
	}
	return zeroNumber()
}

func (value number) asFloat() *big.Float {
	if value.rat != nil {
		return new(big.Float).SetPrec(bigFloatPrecision).SetRat(value.rat)
	}
	if value.float != nil {
		return new(big.Float).SetPrec(bigFloatPrecision).Set(value.float)
	}
	return new(big.Float).SetPrec(bigFloatPrecision)
}

func (value number) float64() (float64, error) {
	result, _ := value.asFloat().Float64()
	if math.IsInf(result, 0) {
		return 0, errNumberLarge
	}
	return result, nil
}

func (value number) isZero() bool {
	if value.rat != nil {
		return value.rat.Sign() == 0
	}
	return value.float == nil || value.float.Sign() == 0
}

func (value number) isNegative() bool {
	if value.rat != nil {
		return value.rat.Sign() < 0
	}
	return value.float != nil && value.float.Sign() < 0
}

func (value number) exactInteger() (*big.Int, bool) {
	if value.rat == nil || value.rat.Denom().Cmp(big.NewInt(1)) != 0 {
		return nil, false
	}
	return new(big.Int).Set(value.rat.Num()), true
}

func addNumbers(left, right number) (number, error) {
	if left.rat != nil && right.rat != nil {
		return checked(numberFromRat(new(big.Rat).Add(left.rat, right.rat)))
	}
	result := new(big.Float).SetPrec(bigFloatPrecision).Add(left.asFloat(), right.asFloat())
	return checked(numberFromFloat(result))
}

func subtractNumbers(left, right number) (number, error) {
	if left.rat != nil && right.rat != nil {
		return checked(numberFromRat(new(big.Rat).Sub(left.rat, right.rat)))
	}
	result := new(big.Float).SetPrec(bigFloatPrecision).Sub(left.asFloat(), right.asFloat())
	return checked(numberFromFloat(result))
}

func multiplyNumbers(left, right number) (number, error) {
	if left.rat != nil && right.rat != nil {
		return checked(numberFromRat(new(big.Rat).Mul(left.rat, right.rat)))
	}
	result := new(big.Float).SetPrec(bigFloatPrecision).Mul(left.asFloat(), right.asFloat())
	return checked(numberFromFloat(result))
}

func divideNumbers(left, right number) (number, error) {
	if right.isZero() {
		return zeroNumber(), errors.New("division by zero")
	}
	if left.rat != nil && right.rat != nil {
		return checked(numberFromRat(new(big.Rat).Quo(left.rat, right.rat)))
	}
	result := new(big.Float).SetPrec(bigFloatPrecision).Quo(left.asFloat(), right.asFloat())
	return checked(numberFromFloat(result))
}

func negateNumber(value number) (number, error) {
	if value.rat != nil {
		return checked(numberFromRat(new(big.Rat).Neg(value.rat)))
	}
	result := new(big.Float).SetPrec(bigFloatPrecision).Neg(value.asFloat())
	return checked(numberFromFloat(result))
}

func absNumber(value number) (number, error) {
	if value.rat != nil {
		return checked(numberFromRat(new(big.Rat).Abs(value.rat)))
	}
	result := value.asFloat()
	if result.Sign() < 0 {
		result.Neg(result)
	}
	return checked(numberFromFloat(result))
}

func sqrtNumber(value number) (number, error) {
	if value.isNegative() {
		return zeroNumber(), errors.New("result is an imaginary number")
	}
	if value.rat != nil {
		numeratorRoot, numeratorOK := perfectSquareRoot(value.rat.Num())
		denominatorRoot, denominatorOK := perfectSquareRoot(value.rat.Denom())
		if numeratorOK && denominatorOK {
			return checked(numberFromRat(new(big.Rat).SetFrac(numeratorRoot, denominatorRoot)))
		}
	}
	floatValue, err := value.float64()
	if err != nil {
		return zeroNumber(), err
	}
	result := math.Sqrt(floatValue)
	if math.IsNaN(result) {
		return zeroNumber(), errors.New("result is an imaginary number")
	}
	return checked(numberFromFloat(new(big.Float).SetPrec(bigFloatPrecision).SetFloat64(result)))
}

func powerNumbers(left, right number) (number, error) {
	if exponent, ok := right.exactInteger(); ok {
		return integerPower(left, exponent)
	}
	if left.isNegative() {
		return zeroNumber(), errors.New("result is an imaginary number")
	}
	leftFloat, err := left.float64()
	if err != nil {
		return zeroNumber(), err
	}
	rightFloat, err := right.float64()
	if err != nil {
		return zeroNumber(), err
	}
	result := math.Pow(leftFloat, rightFloat)
	if math.IsNaN(result) {
		return zeroNumber(), errors.New("result is an imaginary number")
	}
	if math.IsInf(result, 0) {
		return zeroNumber(), errNumberLarge
	}
	return checked(numberFromFloat(new(big.Float).SetPrec(bigFloatPrecision).SetFloat64(result)))
}

func integerPower(base number, exponent *big.Int) (number, error) {
	if exponent.Sign() == 0 {
		return numberFromInt64(1), nil
	}
	if base.isZero() && exponent.Sign() < 0 {
		return zeroNumber(), errors.New("division by zero")
	}
	if base.rat == nil {
		exponentInt, ok := boundedInt64(exponent)
		if !ok {
			return zeroNumber(), errNumberLarge
		}
		return floatIntegerPower(base, exponentInt)
	}

	negativeExponent := exponent.Sign() < 0
	absExponent := new(big.Int).Abs(exponent)
	if !powerIsReasonablyBounded(base.rat, absExponent, negativeExponent) {
		return zeroNumber(), errNumberLarge
	}

	numerator := new(big.Int).Exp(base.rat.Num(), absExponent, nil)
	denominator := new(big.Int).Exp(base.rat.Denom(), absExponent, nil)
	result := new(big.Rat).SetFrac(numerator, denominator)
	if negativeExponent {
		result.Inv(result)
	}
	return checked(numberFromRat(result))
}

func floatIntegerPower(base number, exponent int64) (number, error) {
	result := numberFromFloat(new(big.Float).SetPrec(bigFloatPrecision).SetFloat64(1))
	factor := base.clone()
	remaining := exponent
	if remaining < 0 {
		if base.isZero() {
			return zeroNumber(), errors.New("division by zero")
		}
		var err error
		factor, err = divideNumbers(numberFromInt64(1), factor)
		if err != nil {
			return zeroNumber(), err
		}
		remaining = -remaining
	}
	for remaining > 0 {
		var err error
		if remaining%2 == 1 {
			result, err = multiplyNumbers(result, factor)
			if err != nil {
				return zeroNumber(), err
			}
		}
		remaining /= 2
		if remaining > 0 {
			factor, err = multiplyNumbers(factor, factor)
			if err != nil {
				return zeroNumber(), err
			}
		}
	}
	return checked(result)
}

func factorialNumber(value number) (number, error) {
	integerValue, ok := value.exactInteger()
	if !ok || integerValue.Sign() < 0 {
		return zeroNumber(), errors.New("factorial requires a non-negative integer")
	}
	if !factorialIsReasonablyBounded(integerValue) {
		return zeroNumber(), errNumberLarge
	}
	result := big.NewInt(1)
	one := big.NewInt(1)
	for factor := big.NewInt(2); factor.Cmp(integerValue) <= 0; factor.Add(factor, one) {
		result.Mul(result, factor)
	}
	return checked(numberFromInt(result))
}

func checked(value number) (number, error) {
	if value.rat != nil {
		if digitsBigInt(value.rat.Num()) > maximumComponentDigits || digitsBigInt(value.rat.Denom()) > maximumComponentDigits {
			return zeroNumber(), errNumberLarge
		}
		if integerDigitsRat(value.rat) > maximumMagnitudeDigits {
			return zeroNumber(), errNumberLarge
		}
		return value, nil
	}

	floatValue, err := value.float64()
	if err != nil {
		return zeroNumber(), err
	}
	if math.IsNaN(floatValue) || math.IsInf(floatValue, 0) || magnitudeDigitsFloat(floatValue) > maximumMagnitudeDigits {
		return zeroNumber(), errNumberLarge
	}
	return value, nil
}

func numbersEqual(left, right number) bool {
	if left.rat != nil && right.rat != nil {
		return left.rat.Cmp(right.rat) == 0
	}
	difference, err := subtractNumbers(left, right)
	if err != nil {
		return false
	}
	value, err := difference.float64()
	if err != nil {
		return false
	}
	return math.Abs(value) <= tolerance
}

func formatNumber(value number) string {
	if integerValue, ok := value.exactInteger(); ok {
		text := integerValue.String()
		if len(strings.TrimPrefix(text, "-")) <= plainIntegerDisplayDigits {
			return text
		}
		return scientificStringFromInt(integerValue)
	}
	if value.rat != nil {
		return formatRationalDecimal(value.rat)
	}
	return trimDecimal(value.asFloat().Text('g', decimalDisplayPlaces))
}

func formatRationalDecimal(value *big.Rat) string {
	if value.Denom().Cmp(big.NewInt(1)) == 0 {
		return value.Num().String()
	}

	sign := ""
	numerator := new(big.Int).Set(value.Num())
	if numerator.Sign() < 0 {
		sign = "-"
		numerator.Abs(numerator)
	}

	denominator := value.Denom()
	integerPart := new(big.Int).Quo(numerator, denominator)
	remainder := new(big.Int).Mod(numerator, denominator)
	if remainder.Sign() == 0 {
		return sign + integerPart.String()
	}

	digits := make([]string, 0, decimalDisplayPlaces)
	remainders := make(map[string]int)
	ten := big.NewInt(10)

	for remainder.Sign() != 0 {
		key := remainder.String()
		if _, hasRepeat := remainders[key]; hasRepeat {
			break
		}
		if len(digits) >= maximumRepeatingDecimalDigits {
			return trimDecimal(value.FloatString(decimalDisplayPlaces))
		}

		remainders[key] = len(digits)
		remainder.Mul(remainder, ten)
		digit := new(big.Int).Quo(remainder, denominator)
		digits = append(digits, digit.String())
		remainder.Mod(remainder, denominator)
	}

	decimalPrefix := sign + integerPart.String() + "."
	if remainder.Sign() == 0 {
		return decimalPrefix + strings.Join(digits, "")
	}

	repeatStart := remainders[remainder.String()]
	nonRepeating := strings.Join(digits[:repeatStart], "")
	repeating := strings.Join(digits[repeatStart:], "")
	return decimalPrefix + nonRepeating + overlineDigits(repeating)
}

func overlineDigits(value string) string {
	var builder strings.Builder
	for _, char := range value {
		builder.WriteRune(char)
		builder.WriteString(combiningOverline)
	}
	return builder.String()
}

func perfectSquareRoot(value *big.Int) (*big.Int, bool) {
	if value.Sign() < 0 {
		return nil, false
	}
	root := new(big.Int).Sqrt(value)
	return root, new(big.Int).Mul(new(big.Int).Set(root), root).Cmp(value) == 0
}

func boundedInt64(value *big.Int) (int64, bool) {
	if !value.IsInt64() {
		return 0, false
	}
	result := value.Int64()
	if result == math.MinInt64 {
		return 0, false
	}
	return result, true
}

func powerIsReasonablyBounded(base *big.Rat, exponent *big.Int, negativeExponent bool) bool {
	if exponent.Sign() == 0 {
		return true
	}
	absoluteBase := new(big.Rat).Abs(base)
	if base.Num().Sign() == 0 {
		return !negativeExponent
	}
	if absoluteBase.Cmp(big.NewRat(1, 1)) == 0 {
		return true
	}
	if exponent.BitLen() > 31 {
		return false
	}
	exponentInt := int(exponent.Int64())
	numeratorDigits := digitsBigInt(base.Num()) * exponentInt
	denominatorDigits := digitsBigInt(base.Denom()) * exponentInt
	if numeratorDigits > maximumComponentDigits || denominatorDigits > maximumComponentDigits {
		return false
	}

	if negativeExponent {
		return denominatorDigits <= maximumMagnitudeDigits
	}
	return estimatedMagnitudeDigits(base, exponentInt) <= maximumMagnitudeDigits
}

func estimatedMagnitudeDigits(base *big.Rat, exponent int) int {
	absoluteBase := new(big.Rat).Abs(base)
	floatBase, _ := new(big.Float).SetPrec(bigFloatPrecision).SetRat(absoluteBase).Float64()
	if floatBase <= 1 {
		return 1
	}
	return int(math.Floor(math.Log10(floatBase)*float64(exponent))) + 1
}

func factorialIsReasonablyBounded(value *big.Int) bool {
	if value.BitLen() > 31 {
		return false
	}
	limit := int(value.Int64())
	if limit < 2 {
		return true
	}
	digits := 1.0
	for factor := 2; factor <= limit; factor++ {
		digits += math.Log10(float64(factor))
		if int(math.Floor(digits))+1 > maximumComponentDigits {
			return false
		}
	}
	return int(math.Floor(digits))+1 <= maximumMagnitudeDigits
}

func digitsBigInt(value *big.Int) int {
	if value.Sign() == 0 {
		return 1
	}
	return len(new(big.Int).Abs(value).String())
}

func integerDigitsRat(value *big.Rat) int {
	if value.Sign() == 0 {
		return 1
	}
	quotient := new(big.Int).Quo(new(big.Int).Abs(value.Num()), value.Denom())
	if quotient.Sign() == 0 {
		return 1
	}
	return digitsBigInt(quotient)
}

func magnitudeDigitsFloat(value float64) int {
	absolute := math.Abs(value)
	if absolute < 1 {
		return 1
	}
	return int(math.Floor(math.Log10(absolute))) + 1
}

func scientificStringFromInt(value *big.Int) string {
	text := value.String()
	sign := ""
	if strings.HasPrefix(text, "-") {
		sign = "-"
		text = strings.TrimPrefix(text, "-")
	}
	if len(text) <= decimalDisplayPlaces {
		return sign + text
	}
	mantissaDigits := decimalDisplayPlaces
	if mantissaDigits > len(text) {
		mantissaDigits = len(text)
	}
	mantissa := text[:1]
	if mantissaDigits > 1 {
		mantissa += "." + strings.TrimRight(text[1:mantissaDigits], "0")
	}
	return fmt.Sprintf("%se+%d", sign+mantissa, len(text)-1)
}

func trimDecimal(value string) string {
	if strings.ContainsAny(value, "eE") {
		return value
	}
	value = strings.TrimRight(value, "0")
	value = strings.TrimRight(value, ".")
	if value == "-0" || value == "" {
		return "0"
	}
	return value
}
