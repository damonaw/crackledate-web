package game

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"time"
)

type hintParityManifest struct {
	Version int              `json:"version"`
	Cases   []hintParityCase `json:"cases"`
}

type hintParityCase struct {
	ID                            string  `json:"id"`
	Date                          string  `json:"date"`
	Digits                        []int   `json:"digits"`
	Mode                          string  `json:"mode"`
	Prefix                        string  `json:"prefix"`
	Outcome                       string  `json:"outcome"`
	Solution                      *string `json:"solution"`
	Step1                         *string `json:"step1"`
	Step2                         *string `json:"step2"`
	Step3                         *string `json:"step3"`
	BalancingHint                 *string `json:"balancingHint"`
	MathTip                       *string `json:"mathTip"`
	MaximumCandidateConstructions *uint64 `json:"maximumCandidateConstructions,omitempty"`
	MaximumWallTimeNanos          *int64  `json:"maximumWallTimeNanos,omitempty"`
	CancellationCheckInterval     *uint64 `json:"cancellationCheckInterval,omitempty"`
}

type hintParitySeed struct {
	ID                            string
	Date                          string
	Digits                        []int
	Mode                          string
	Prefix                        string
	Outcome                       string
	MaximumCandidateConstructions *uint64
	MaximumWallTimeNanos          *int64
	CancellationCheckInterval     *uint64
}

func GenerateHintParityV1() (manifest []byte, digest []byte, err error) {
	cases := make([]hintParityCase, 0, len(hintParityV1Seeds))
	for _, seed := range hintParityV1Seeds {
		fixture, err := generateHintParityCase(seed)
		if err != nil {
			return nil, nil, err
		}
		cases = append(cases, fixture)
	}

	manifest, err = json.MarshalIndent(hintParityManifest{Version: 1, Cases: cases}, "", "  ")
	if err != nil {
		return nil, nil, fmt.Errorf("marshal hint parity v1: %w", err)
	}
	manifest = append(manifest, '\n')
	sum := sha256.Sum256(manifest)
	digest = []byte(hex.EncodeToString(sum[:]) + "\n")
	return manifest, digest, nil
}

func generateHintParityCase(seed hintParitySeed) (hintParityCase, error) {
	parsedDate, err := time.ParseInLocation("2006-01-02", seed.Date, time.Local)
	if err != nil {
		return hintParityCase{}, fmt.Errorf("%s: parse date: %w", seed.ID, err)
	}
	if dateDigits := PuzzleForDate(parsedDate).Digits; !reflect.DeepEqual(seed.Digits, dateDigits) {
		return hintParityCase{}, fmt.Errorf("%s: digits %v do not match date digits %v", seed.ID, seed.Digits, dateDigits)
	}

	budget := DefaultSearchBudget
	if seed.MaximumCandidateConstructions != nil {
		budget.MaxCandidateConstructions = *seed.MaximumCandidateConstructions
	}
	if seed.MaximumWallTimeNanos != nil {
		budget.MaxDuration = time.Duration(*seed.MaximumWallTimeNanos)
	}
	if seed.CancellationCheckInterval != nil {
		budget.CancellationCheckInterval = *seed.CancellationCheckInterval
	}
	if budget.MaxCandidateConstructions == 0 || budget.MaxDuration <= 0 || budget.CancellationCheckInterval == 0 {
		return hintParityCase{}, fmt.Errorf("%s: budget controls must be positive", seed.ID)
	}

	hint, _, generationErr := GenerateHint(
		context.Background(),
		seed.Digits,
		seed.Mode,
		"",
		seed.Prefix,
		budget,
	)
	fixture := hintParityCase{
		ID:                            seed.ID,
		Date:                          seed.Date,
		Digits:                        seed.Digits,
		Mode:                          seed.Mode,
		Prefix:                        seed.Prefix,
		Outcome:                       seed.Outcome,
		MaximumCandidateConstructions: seed.MaximumCandidateConstructions,
		MaximumWallTimeNanos:          seed.MaximumWallTimeNanos,
		CancellationCheckInterval:     seed.CancellationCheckInterval,
	}

	switch seed.Outcome {
	case "solution":
		if generationErr != nil {
			return hintParityCase{}, fmt.Errorf("%s: declared solution: %w", seed.ID, generationErr)
		}
		fixture.Solution = stringPointer(hint.Solution)
		fixture.Step1 = stringPointer(hint.Step1)
		fixture.Step2 = stringPointer(hint.Step2)
		fixture.Step3 = stringPointer(hint.Step3)
		fixture.BalancingHint = optionalStringPointer(hint.BalancingHint)
		fixture.MathTip = optionalStringPointer(hint.MathTip)
	case "no_solution":
		if !errors.Is(generationErr, ErrNoSolution) {
			return hintParityCase{}, fmt.Errorf("%s: declared no_solution, got %v", seed.ID, generationErr)
		}
	case "budget_exhausted":
		if !errors.Is(generationErr, ErrSearchBudgetExceeded) {
			return hintParityCase{}, fmt.Errorf("%s: declared budget_exhausted, got %v", seed.ID, generationErr)
		}
	default:
		return hintParityCase{}, fmt.Errorf("%s: unsupported declared outcome %q", seed.ID, seed.Outcome)
	}
	return fixture, nil
}

func stringPointer(value string) *string {
	return &value
}

func optionalStringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func uint64Pointer(value uint64) *uint64 {
	return &value
}

func int64Pointer(value int64) *int64 {
	return &value
}

var hintParityV1Seeds = []hintParitySeed{
	{
		ID:      "classic-empty-prefix",
		Date:    "0001-01-01",
		Digits:  []int{1, 1, 1},
		Mode:    "classic",
		Prefix:  "",
		Outcome: "solution",
	},
	{
		ID:      "classic-partial-root-power-zero-concatenation-2026-05-16",
		Date:    "2026-05-16",
		Digits:  []int{5, 1, 6, 2, 0, 2, 6},
		Mode:    "classic",
		Prefix:  "5+√16",
		Outcome: "solution",
	},
	{
		ID:      "classic-exact-fraction",
		Date:    "2026-01-02",
		Digits:  []int{1, 2, 2, 0, 2, 6},
		Mode:    "classic",
		Prefix:  "1/2",
		Outcome: "solution",
	},
	{
		ID:      "classic-factorial",
		Date:    "2026-01-02",
		Digits:  []int{1, 2, 2, 0, 2, 6},
		Mode:    "classic",
		Prefix:  "12/2=0!",
		Outcome: "solution",
	},
	{
		ID:      "classic-absolute-value",
		Date:    "2026-01-02",
		Digits:  []int{1, 2, 2, 0, 2, 6},
		Mode:    "classic",
		Prefix:  "12/2=|0|",
		Outcome: "solution",
	},
	{
		ID:      "classic-no-solution",
		Date:    "2026-01-02",
		Digits:  []int{1, 2, 2, 0, 2, 6},
		Mode:    "classic",
		Prefix:  "12/2=|0!",
		Outcome: "no_solution",
	},
	{
		ID:                            "classic-budget-exhausted",
		Date:                          "2026-01-01",
		Digits:                        []int{1, 1, 2, 0, 2, 6},
		Mode:                          "classic",
		Prefix:                        "",
		Outcome:                       "budget_exhausted",
		MaximumCandidateConstructions: uint64Pointer(1),
		MaximumWallTimeNanos:          int64Pointer(int64(3 * time.Second)),
		CancellationCheckInterval:     uint64Pointer(1),
	},
}
