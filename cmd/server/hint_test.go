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
			sol:          "2*3=6*1",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 6, 1},
			expectedHint: "The left side equals 6. You need to use the remaining digits (6, 1) to also make 6 on the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 6 using: 6 × 1 = 6",
		},
		{
			name:         "classic subtraction",
			sol:          "2*3=10-4",
			mode:         "classic",
			prefix:       "2*3=",
			digits:       []int{2, 3, 1, 0, 4},
			expectedHint: "The left side equals 6. You need to use the remaining digits (1, 0, 4) to also make 6 on the right side.",
			expectedTip:  "Tip: try combining the digits using arithmetic operations. You can make 6 using: 10 − 4 = 6",
		},
		{
			name:         "other mode",
			sol:          "2*3=6*1",
			mode:         "target",
			prefix:       "2*3=",
			digits:       []int{2, 3, 6, 1},
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
