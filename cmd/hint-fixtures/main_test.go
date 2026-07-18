package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"crackledate-web/internal/game"
)

func TestRunRequiresExactlyOneMode(t *testing.T) {
	for _, args := range [][]string{
		nil,
		{"--write", "--check"},
		{"--unknown"},
		{"--write", "extra"},
	} {
		var stdout, stderr bytes.Buffer
		if code := run(args, t.TempDir(), &stdout, &stderr); code == 0 {
			t.Errorf("run(%q) exit = 0, want nonzero", args)
		}
	}
}

func TestRunWritesChecksAndDetectsStaleArtifacts(t *testing.T) {
	root := t.TempDir()
	artifactDir := filepath.Join(root, "internal", "game", "testdata")
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact directory: %v", err)
	}
	for _, name := range []string{"hint-parity-v1.json", "hint-parity-v1.sha256"} {
		if err := os.WriteFile(filepath.Join(artifactDir, name), []byte("old\n"), 0o600); err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}
	manifest, digest, err := game.GenerateHintParityV1()
	if err != nil {
		t.Fatalf("generate expected artifacts: %v", err)
	}

	var stdout, stderr bytes.Buffer
	if code := run([]string{"--write"}, root, &stdout, &stderr); code != 0 {
		t.Fatalf("--write exit = %d, stderr = %q", code, stderr.String())
	}
	assertArtifact := func(name string, want []byte) {
		t.Helper()
		path := filepath.Join(artifactDir, name)
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("%s bytes differ", name)
		}
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", name, err)
		}
		if mode := info.Mode().Perm(); mode != 0o644 {
			t.Fatalf("%s mode = %#o, want 0644", name, mode)
		}
	}
	assertArtifact("hint-parity-v1.json", manifest)
	assertArtifact("hint-parity-v1.sha256", digest)

	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"--check"}, root, &stdout, &stderr); code != 0 {
		t.Fatalf("fresh --check exit = %d, stderr = %q", code, stderr.String())
	}

	digestPath := filepath.Join(artifactDir, "hint-parity-v1.sha256")
	if err := os.WriteFile(digestPath, []byte("stale\n"), 0o644); err != nil {
		t.Fatalf("make digest stale: %v", err)
	}
	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"--check"}, root, &stdout, &stderr); code != 1 {
		t.Fatalf("stale --check exit = %d, want 1", code)
	}
	if got := stderr.String(); got != "hint parity artifacts are stale\n" {
		t.Fatalf("stale stderr = %q", got)
	}
}

func TestRunCheckReportsMissingArtifactAsStale(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "internal", "game", "testdata"), 0o755); err != nil {
		t.Fatalf("mkdir artifact directory: %v", err)
	}
	var stdout, stderr bytes.Buffer
	if code := run([]string{"--check"}, root, &stdout, &stderr); code != 1 {
		t.Fatalf("missing --check exit = %d, want 1", code)
	}
	if got := stderr.String(); got != "hint parity artifacts are stale\n" {
		t.Fatalf("missing stderr = %q", got)
	}
}
