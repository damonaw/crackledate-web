package game

import (
	"encoding/json"
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
	if err := json.Unmarshal(body, &manifest); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	if manifest.Version != 1 || len(manifest.Cases) < 12 {
		t.Fatalf("version/cases = %d/%d", manifest.Version, len(manifest.Cases))
	}
	for _, fixture := range manifest.Cases {
		result := ValidateEquation(fixture.Equation, fixture.Digits, fixture.Mode, "")
		if result.Valid != fixture.ExpectedValid {
			t.Fatalf("%s valid = %v; error %q", fixture.ID, result.Valid, result.ErrorMessage)
		}
		if result.ErrorMessage != fixture.ExpectedError {
			t.Fatalf("%s error = %q, want %q", fixture.ID, result.ErrorMessage, fixture.ExpectedError)
		}
		if fixture.ExpectedLeft != "" && (result.LeftValue == nil || *result.LeftValue != fixture.ExpectedLeft) {
			t.Fatalf("%s left = %#v", fixture.ID, result.LeftValue)
		}
		if fixture.ExpectedRight != "" && (result.RightValue == nil || *result.RightValue != fixture.ExpectedRight) {
			t.Fatalf("%s right = %#v", fixture.ID, result.RightValue)
		}
	}
}
