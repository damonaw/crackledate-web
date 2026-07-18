package game

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

type hintParityManifestFixture struct {
	Version int                     `json:"version"`
	Cases   []hintParityCaseFixture `json:"cases"`
}

type hintParityCaseFixture struct {
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

func TestHintParityV1Artifacts(t *testing.T) {
	defaultBudgetBefore := DefaultSearchBudget
	manifest, digest, err := GenerateHintParityV1()
	if err != nil {
		t.Fatalf("generate hint parity v1: %v", err)
	}
	if DefaultSearchBudget != defaultBudgetBefore {
		t.Fatalf("fixture generation mutated DefaultSearchBudget: before=%#v after=%#v", defaultBudgetBefore, DefaultSearchBudget)
	}

	checkedManifest, err := os.ReadFile("testdata/hint-parity-v1.json")
	if err != nil {
		t.Fatalf("read checked-in manifest: %v", err)
	}
	checkedDigest, err := os.ReadFile("testdata/hint-parity-v1.sha256")
	if err != nil {
		t.Fatalf("read checked-in digest: %v", err)
	}
	if !bytes.Equal(manifest, checkedManifest) {
		t.Fatal("generated manifest differs from testdata/hint-parity-v1.json")
	}
	if !bytes.Equal(digest, checkedDigest) {
		t.Fatal("generated digest differs from testdata/hint-parity-v1.sha256")
	}

	t.Run("canonical JSON", func(t *testing.T) {
		if len(manifest) < 2 || manifest[len(manifest)-1] != '\n' || manifest[len(manifest)-2] == '\n' {
			t.Fatal("manifest must end in exactly one newline")
		}
		if bytes.Contains(manifest, []byte{'\r'}) {
			t.Fatal("manifest contains a carriage return")
		}

		var decoded hintParityManifestFixture
		decoder := json.NewDecoder(bytes.NewReader(manifest))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&decoded); err != nil {
			t.Fatalf("decode manifest: %v", err)
		}
		var trailing any
		if err := decoder.Decode(&trailing); err != io.EOF {
			t.Fatalf("manifest has trailing JSON: %v", err)
		}
		canonical, err := json.MarshalIndent(decoded, "", "  ")
		if err != nil {
			t.Fatalf("encode canonical manifest: %v", err)
		}
		canonical = append(canonical, '\n')
		if !bytes.Equal(manifest, canonical) {
			t.Fatal("manifest is not canonical two-space JSON in schema field order")
		}
	})

	t.Run("digest", func(t *testing.T) {
		if len(digest) != 65 {
			t.Fatalf("digest length = %d, want 65", len(digest))
		}
		if !regexp.MustCompile(`^[0-9a-f]{64}\n$`).Match(digest) {
			t.Fatalf("digest = %q, want lowercase SHA-256 plus newline", digest)
		}
		actual := sha256.Sum256(manifest)
		want, err := hex.DecodeString(string(bytes.TrimSuffix(digest, []byte{'\n'})))
		if err != nil {
			t.Fatalf("decode digest: %v", err)
		}
		if !bytes.Equal(actual[:], want) {
			t.Fatalf("sha256(manifest) = %x, want %x", actual, want)
		}
	})
}

func TestHintParityV1Contract(t *testing.T) {
	manifestBytes, _, err := GenerateHintParityV1()
	if err != nil {
		t.Fatalf("generate hint parity v1: %v", err)
	}
	var manifest hintParityManifestFixture
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.Version != 1 {
		t.Fatalf("version = %d, want 1", manifest.Version)
	}
	if len(manifest.Cases) != 7 {
		t.Fatalf("case count = %d, want 7", len(manifest.Cases))
	}

	requiredIDs := map[string]struct{}{
		"classic-empty-prefix": {},
		"classic-partial-root-power-zero-concatenation-2026-05-16": {},
		"classic-exact-fraction":                                   {},
		"classic-factorial":                                        {},
		"classic-absolute-value":                                   {},
		"classic-no-solution":                                      {},
		"classic-budget-exhausted":                                 {},
	}
	seenIDs := make(map[string]struct{}, len(manifest.Cases))
	var covered struct {
		emptyPrefix, partialMay16, fraction, factorial, absolute, noSolution, budgetExhausted bool
	}
	for _, fixture := range manifest.Cases {
		if fixture.ID == "" {
			t.Error("fixture has empty id")
		}
		if _, duplicate := seenIDs[fixture.ID]; duplicate {
			t.Errorf("duplicate fixture id %q", fixture.ID)
		}
		seenIDs[fixture.ID] = struct{}{}
		if _, required := requiredIDs[fixture.ID]; !required {
			t.Errorf("unexpected fixture id %q", fixture.ID)
		}
		if fixture.Mode != "classic" {
			t.Errorf("%s mode = %q, want classic", fixture.ID, fixture.Mode)
		}
		if fixture.Outcome != "solution" && fixture.Outcome != "no_solution" && fixture.Outcome != "budget_exhausted" {
			t.Errorf("%s outcome = %q", fixture.ID, fixture.Outcome)
		}

		parsed, err := time.ParseInLocation("2006-01-02", fixture.Date, time.Local)
		if err != nil {
			t.Errorf("%s date = %q: %v", fixture.ID, fixture.Date, err)
		} else if want := PuzzleForDate(parsed).Digits; !reflect.DeepEqual(fixture.Digits, want) {
			t.Errorf("%s digits = %v, want date digits %v", fixture.ID, fixture.Digits, want)
		}

		hintFields := []*string{
			fixture.Solution,
			fixture.Step1,
			fixture.Step2,
			fixture.Step3,
			fixture.BalancingHint,
			fixture.MathTip,
		}
		if fixture.Outcome == "solution" {
			for index, value := range hintFields[:4] {
				if value == nil || *value == "" {
					t.Errorf("%s required solution field %d is empty", fixture.ID, index)
				}
			}
		} else {
			for index, value := range hintFields {
				if value != nil {
					t.Errorf("%s non-solution field %d = %q, want null", fixture.ID, index, *value)
				}
			}
		}

		hasBudgetFields := fixture.MaximumCandidateConstructions != nil ||
			fixture.MaximumWallTimeNanos != nil || fixture.CancellationCheckInterval != nil
		if fixture.Outcome == "budget_exhausted" {
			if fixture.MaximumCandidateConstructions == nil || fixture.MaximumWallTimeNanos == nil || fixture.CancellationCheckInterval == nil {
				t.Errorf("%s must include all three flat budget controls", fixture.ID)
			}
		} else if hasBudgetFields {
			t.Errorf("%s includes budget controls outside budget_exhausted", fixture.ID)
		}

		switch fixture.ID {
		case "classic-empty-prefix":
			covered.emptyPrefix = fixture.Outcome == "solution" && fixture.Prefix == ""
		case "classic-partial-root-power-zero-concatenation-2026-05-16":
			covered.partialMay16 = fixture.Date == "2026-05-16" &&
				reflect.DeepEqual(fixture.Digits, []int{5, 1, 6, 2, 0, 2, 6}) &&
				fixture.Prefix == "5+√16" && fixture.Solution != nil &&
				strings.Contains(*fixture.Solution, "√16") &&
				strings.Contains(*fixture.Solution, "^") &&
				strings.Contains(*fixture.Solution, "0")
		case "classic-exact-fraction":
			covered.fraction = fixture.Outcome == "solution" && fixture.Solution != nil &&
				strings.Contains(*fixture.Solution, "/")
		case "classic-factorial":
			covered.factorial = fixture.Outcome == "solution" && fixture.Solution != nil &&
				strings.Contains(*fixture.Solution, "!") &&
				fixture.BalancingHint != nil && fixture.MathTip != nil
		case "classic-absolute-value":
			covered.absolute = fixture.Outcome == "solution" && fixture.Solution != nil &&
				strings.Contains(*fixture.Solution, "|") &&
				fixture.BalancingHint != nil && fixture.MathTip != nil
		case "classic-no-solution":
			covered.noSolution = fixture.Outcome == "no_solution"
		case "classic-budget-exhausted":
			covered.budgetExhausted = fixture.Outcome == "budget_exhausted" &&
				fixture.MaximumCandidateConstructions != nil &&
				fixture.MaximumWallTimeNanos != nil &&
				fixture.CancellationCheckInterval != nil
		}
	}
	for requiredID := range requiredIDs {
		if _, found := seenIDs[requiredID]; !found {
			t.Errorf("missing required fixture id %q", requiredID)
		}
	}

	if !covered.emptyPrefix || !covered.partialMay16 || !covered.fraction || !covered.factorial ||
		!covered.absolute || !covered.noSolution || !covered.budgetExhausted {
		t.Fatalf("fixture coverage = %+v", covered)
	}
}
