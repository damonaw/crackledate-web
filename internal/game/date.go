package game

import (
	"math/big"
	"strconv"
	"time"
	"unicode"
)

type Puzzle struct {
	DateIdentifier     string `json:"dateIdentifier"`
	DisplayDate        string `json:"displayDate"`
	FormattedDate      string `json:"formattedDate"`
	Digits             []int  `json:"digits"`
	DelimiterPositions []int  `json:"delimiterPositions"`
	TargetValue        string `json:"targetValue"`
}

func PuzzleForDate(date time.Time) Puzzle {
	month := int(date.Month())
	day := date.Day()
	year := date.Year()
	formatted := strconv.Itoa(month) + "-" + strconv.Itoa(day) + "-" + strconv.Itoa(year)

	digits := make([]int, 0, len(formatted))
	delimiters := make([]int, 0, 2)
	digitIndex := 0
	for _, char := range formatted {
		if unicode.IsDigit(char) {
			digits = append(digits, int(char-'0'))
			digitIndex++
		} else if char == '-' {
			delimiters = append(delimiters, digitIndex-1)
		}
	}

	return Puzzle{
		DateIdentifier:     date.Format("2006-01-02"),
		DisplayDate:        date.Format("January 2, 2006"),
		FormattedDate:      formatted,
		Digits:             digits,
		DelimiterPositions: delimiters,
		TargetValue:        findTargetValue(digits),
	}
}

func findTargetValue(digits []int) string {
	memo := make(map[string][]solvedExpr)
	
	solvables := make(map[int]bool)
	for i := 1; i < len(digits); i++ {
		left := gen(digits[:i], memo)
		right := gen(digits[i:], memo)
		
		leftVals := make(map[string]*big.Rat)
		for _, l := range left {
			leftVals[l.val.String()] = l.val
		}
		
		for _, r := range right {
			if _, ok := leftVals[r.val.String()]; ok {
				if r.val.IsInt() {
					valInt, err := strconv.Atoi(r.val.Num().String())
					if err == nil && valInt > 0 {
						solvables[valInt] = true
					}
				}
			}
		}
	}
	
	preferred := []int{10, 24, 20, 12, 16, 8, 6, 4, 15, 18, 30}
	for _, p := range preferred {
		if solvables[p] {
			return strconv.Itoa(p)
		}
	}
	
	for i := 1; i <= 200; i++ {
		if solvables[i] {
			return strconv.Itoa(i)
		}
	}
	
	allExprs := gen(digits, memo)
	singleSolvables := make(map[int]bool)
	for _, expr := range allExprs {
		if expr.val.IsInt() {
			valInt, err := strconv.Atoi(expr.val.Num().String())
			if err == nil && valInt > 0 {
				singleSolvables[valInt] = true
			}
		}
	}
	
	for _, p := range preferred {
		if singleSolvables[p] {
			return strconv.Itoa(p)
		}
	}
	for i := 1; i <= 200; i++ {
		if singleSolvables[i] {
			return strconv.Itoa(i)
		}
	}
	
	return "10"
}

func ParsePuzzleDate(value string, now time.Time) (time.Time, error) {
	if value == "" {
		return dateOnly(now), nil
	}
	parsed, err := time.ParseInLocation("2006-01-02", value, time.Local)
	if err != nil {
		return time.Time{}, err
	}
	return dateOnly(parsed), nil
}

func dateOnly(date time.Time) time.Time {
	return time.Date(date.Year(), date.Month(), date.Day(), 12, 0, 0, 0, time.Local)
}
