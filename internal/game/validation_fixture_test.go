package game

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"testing"
)

type validationFixtureManifest struct {
	Version int `json:"version"`
	Cases   []struct {
		ID            string `json:"id"`
		Digits        []int  `json:"digits"`
		Equation      string `json:"equation"`
		Mode          string `json:"mode"`
		ExpectedValid bool   `json:"expectedValid"`
		ExpectedError string `json:"expectedError,omitempty"`
		ExpectedLeft  string `json:"expectedLeft,omitempty"`
		ExpectedRight string `json:"expectedRight,omitempty"`
	} `json:"cases"`
}

func TestValidationParityV1(t *testing.T) {
	body, err := os.ReadFile("testdata/validation-parity-v1.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var manifest validationFixtureManifest
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		t.Fatalf("fixture has trailing JSON: %v", err)
	}
	requiredIDs := map[string]struct{}{
		"known-valid-root-power":     {},
		"incomplete-missing-equals":  {},
		"unequal-sides":              {},
		"out-of-order-digits":        {},
		"leading-zero-concatenation": {},
		"separated-zero-valid":       {},
		"exact-fraction":             {},
		"absolute-value":             {},
		"factorial":                  {},
		"integral-power":             {},
		"division-by-zero":           {},
		"non-real-root":              {},
		"missing-date-digit":         {},
		"duplicate-date-digit":       {},
		"multiple-equals":            {},
	}
	t.Run("canonical bytes", func(t *testing.T) {
		canonical, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil {
			t.Fatalf("encode canonical fixture: %v", err)
		}
		canonical = append(canonical, '\n')
		if !bytes.Equal(body, canonical) {
			t.Fatal("fixture is not canonical two-space JSON with one trailing newline")
		}
	})
	t.Run("contract", func(t *testing.T) {
		if manifest.Version != 1 || len(manifest.Cases) != 15 {
			t.Fatalf("version/cases = %d/%d", manifest.Version, len(manifest.Cases))
		}
		seenIDs := make(map[string]struct{}, len(manifest.Cases))
		for _, fixture := range manifest.Cases {
			if fixture.ID == "" {
				t.Error("fixture has an empty ID")
				continue
			}
			if _, duplicate := seenIDs[fixture.ID]; duplicate {
				t.Errorf("duplicate fixture ID %q", fixture.ID)
			}
			seenIDs[fixture.ID] = struct{}{}
			if _, required := requiredIDs[fixture.ID]; !required {
				t.Errorf("unexpected fixture ID %q", fixture.ID)
			}
			if fixture.Mode != "classic" {
				t.Errorf("%s mode = %q, want classic", fixture.ID, fixture.Mode)
			}
		}
		for requiredID := range requiredIDs {
			if _, found := seenIDs[requiredID]; !found {
				t.Errorf("missing required fixture ID %q", requiredID)
			}
		}
	})
	t.Run("validator outputs", func(t *testing.T) {
		for _, fixture := range manifest.Cases {
			result := ValidateEquation(fixture.Equation, fixture.Digits, fixture.Mode, "")
			if result.Valid != fixture.ExpectedValid {
				t.Errorf("%s valid = %v; error %q", fixture.ID, result.Valid, result.ErrorMessage)
			}
			if result.ErrorMessage != fixture.ExpectedError {
				t.Errorf("%s error = %q, want %q", fixture.ID, result.ErrorMessage, fixture.ExpectedError)
			}
			if fixture.ExpectedLeft != "" && (result.LeftValue == nil || *result.LeftValue != fixture.ExpectedLeft) {
				t.Errorf("%s left = %#v", fixture.ID, result.LeftValue)
			}
			if fixture.ExpectedRight != "" && (result.RightValue == nil || *result.RightValue != fixture.ExpectedRight) {
				t.Errorf("%s right = %#v", fixture.ID, result.RightValue)
			}
		}
	})
}

func TestValidateEquationRejectsDirectDivisionByZero(t *testing.T) {
	result := ValidateEquation("1/0=2", []int{1, 0, 2}, "classic", "")
	if result.Valid {
		t.Fatal("direct division by zero was accepted")
	}
	if result.ErrorMessage != "Cannot divide by zero" {
		t.Fatalf("error = %q, want %q", result.ErrorMessage, "Cannot divide by zero")
	}
}
