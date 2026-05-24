package game

import (
	"reflect"
	"testing"
	"time"
)

func TestPuzzleForDateUsesDateDigitsInOrder(t *testing.T) {
	date := time.Date(2026, time.May, 16, 12, 0, 0, 0, time.Local)
	puzzle := PuzzleForDate(date)

	if puzzle.DateIdentifier != "2026-05-16" {
		t.Fatalf("DateIdentifier = %q", puzzle.DateIdentifier)
	}
	if puzzle.DisplayDate != "May 16, 2026" {
		t.Fatalf("DisplayDate = %q", puzzle.DisplayDate)
	}
	if puzzle.FormattedDate != "5-16-2026" {
		t.Fatalf("FormattedDate = %q", puzzle.FormattedDate)
	}
	if !reflect.DeepEqual(puzzle.Digits, []int{5, 1, 6, 2, 0, 2, 6}) {
		t.Fatalf("Digits = %#v", puzzle.Digits)
	}
	if !reflect.DeepEqual(puzzle.DelimiterPositions, []int{0, 2}) {
		t.Fatalf("DelimiterPositions = %#v", puzzle.DelimiterPositions)
	}
}
