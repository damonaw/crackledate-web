package game

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

const tolerance = 1e-10
const maximumMagnitude = 9_000_000_000_000_000_000.0
const maximumExactIntegerDisplay = 9_007_199_254_740_992.0

var (
	errUnexpectedEnd = errors.New("unexpected end of expression")
	errUnexpected    = errors.New("unexpected token")
	errNumberLarge   = errors.New("calculated number is too large")
)

type tokenKind int

const (
	tokenNumber tokenKind = iota
	tokenOperator
	tokenEquals
)

type token struct {
	kind  tokenKind
	text  string
	value float64
}

func Evaluate(expression string) (float64, error) {
	tokens, err := lex(expression)
	if err != nil {
		return 0, err
	}
	if len(tokens) == 0 {
		return 0, errors.New("empty expression")
	}
	parser := expressionParser{tokens: tokens}
	value, err := parser.parseExpression()
	if err != nil {
		return 0, err
	}
	if parser.index < len(tokens) {
		return 0, fmt.Errorf("%w: %s", errUnexpected, tokens[parser.index].text)
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
			value, err := strconv.ParseFloat(text, 64)
			if err != nil {
				return nil, errNumberLarge
			}
			tokens = append(tokens, token{kind: tokenNumber, text: text, value: value})
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

func (parser *expressionParser) parseExpression() (float64, error) {
	result, err := parser.parseTerm()
	if err != nil {
		return 0, err
	}

	for parser.matchOperator("+") || parser.matchOperator("-") {
		operation := parser.previous().text
		right, err := parser.parseTerm()
		if err != nil {
			return 0, err
		}
		if operation == "+" {
			result += right
		} else {
			result -= right
		}
		result, err = checked(result)
		if err != nil {
			return 0, err
		}
	}
	return result, nil
}

func (parser *expressionParser) parseTerm() (float64, error) {
	result, err := parser.parsePower()
	if err != nil {
		return 0, err
	}

	for {
		if parser.matchOperator("*") || parser.matchOperator("×") || parser.matchOperator("x") || parser.matchOperator("X") {
			right, err := parser.parsePower()
			if err != nil {
				return 0, err
			}
			result *= right
		} else if parser.matchOperator("/") || parser.matchOperator("÷") {
			right, err := parser.parsePower()
			if err != nil {
				return 0, err
			}
			if math.Abs(right) <= tolerance {
				return 0, errors.New("division by zero")
			}
			result /= right
		} else if parser.startsImplicitMultiplication() {
			right, err := parser.parsePower()
			if err != nil {
				return 0, err
			}
			result *= right
		} else {
			break
		}

		result, err = checked(result)
		if err != nil {
			return 0, err
		}
	}
	return result, nil
}

func (parser *expressionParser) parsePower() (float64, error) {
	left, err := parser.parseUnary()
	if err != nil {
		return 0, err
	}
	if parser.matchOperator("^") {
		right, err := parser.parsePower()
		if err != nil {
			return 0, err
		}
		return checked(math.Pow(left, right))
	}
	return left, nil
}

func (parser *expressionParser) parseUnary() (float64, error) {
	if parser.matchOperator("-") {
		value, err := parser.parseUnary()
		if err != nil {
			return 0, err
		}
		return checked(-value)
	}
	if parser.matchOperator("√") {
		value, err := parser.parseUnary()
		if err != nil {
			return 0, err
		}
		if value < 0 {
			return 0, errors.New("result is an imaginary number")
		}
		return checked(math.Sqrt(value))
	}
	return parser.parsePostfix()
}

func (parser *expressionParser) parsePostfix() (float64, error) {
	result, err := parser.parsePrimary()
	if err != nil {
		return 0, err
	}
	for parser.matchOperator("!") {
		if result < 0 || math.Abs(result-math.Round(result)) > tolerance {
			return 0, errors.New("factorial requires a non-negative integer")
		}
		if result > 20 {
			return 0, errNumberLarge
		}
		value := 1.0
		for factor := 2; factor <= int(result); factor++ {
			value *= float64(factor)
		}
		result = value
	}
	return checked(result)
}

func (parser *expressionParser) parsePrimary() (float64, error) {
	if parser.isAtEnd() {
		return 0, errUnexpectedEnd
	}
	if parser.matchKind(tokenNumber) {
		return parser.previous().value, nil
	}
	if parser.matchOperator("(") {
		value, err := parser.parseExpression()
		if err != nil {
			return 0, err
		}
		if !parser.matchOperator(")") {
			return 0, errors.New("missing closing parenthesis")
		}
		return value, nil
	}
	if parser.matchOperator("|") {
		value, err := parser.parseExpression()
		if err != nil {
			return 0, err
		}
		if !parser.matchOperator("|") {
			return 0, errors.New("missing closing absolute value")
		}
		return math.Abs(value), nil
	}
	return 0, fmt.Errorf("%w: %s", errUnexpected, parser.peek().text)
}

func (parser *expressionParser) startsImplicitMultiplication() bool {
	if parser.isAtEnd() {
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

func checked(value float64) (float64, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Abs(value) > maximumMagnitude {
		return 0, errNumberLarge
	}
	return value, nil
}

func formatNumber(value float64) string {
	if math.Abs(value-math.Round(value)) <= tolerance {
		if math.Abs(value) > maximumExactIntegerDisplay {
			return strconv.FormatFloat(value, 'g', 12, 64)
		}
		return strconv.FormatInt(int64(math.Round(value)), 10)
	}
	return strconv.FormatFloat(value, 'g', 12, 64)
}
