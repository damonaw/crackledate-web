package main

import (
	"testing"
)


func TestComputeBalancingHint(t *testing.T) {
	tests := []struct {
		name         string
		sol          string
		mode         string
		prefix       string
		digits       []int
		expectedHint string
		expectedTip  string
	}{
		{
			name:         "classic addition",
			sol:          "2*3=1+6",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 1, 6},
			expectedHint: "6 is the last digit, so you need to make the rest of the right side digits equal 1 for the left side to equal the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 1 using the remaining digits: 1 = 1",
		},
		{
			name:         "classic subtraction",
			sol:          "2*3=10-4",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 1, 0, 4},
			expectedHint: "4 is the last digit, so you need to make the rest of the right side digits equal 10 for the left side to equal the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 10 using the remaining digits: 10 = 10",
		},
		{
			name:         "other mode",
			sol:          "2*3=1+6",
			mode:         "target",
			prefix:       "2*3=",
			digits:       []int{2, 3, 1, 6},
			expectedHint: "",
			expectedTip:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actualHint, actualTip := computeBalancingHintAndTip(tc.sol, tc.mode, tc.prefix, tc.digits)
			if actualHint != tc.expectedHint {
				t.Errorf("expected hint %q, got %q", tc.expectedHint, actualHint)
			}
			if actualTip != tc.expectedTip {
				t.Errorf("expected tip %q, got %q", tc.expectedTip, actualTip)
			}
		})
	}
}
