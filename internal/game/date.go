package game

import (
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
	}
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
