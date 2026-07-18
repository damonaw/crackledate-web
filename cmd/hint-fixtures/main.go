package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"crackledate-web/internal/game"
)

const (
	manifestName = "hint-parity-v1.json"
	digestName   = "hint-parity-v1.sha256"
)

func main() {
	os.Exit(run(os.Args[1:], ".", os.Stdout, os.Stderr))
}

func run(args []string, root string, stdout io.Writer, stderr io.Writer) int {
	flags := flag.NewFlagSet("hint-fixtures", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	write := flags.Bool("write", false, "write canonical hint parity artifacts")
	check := flags.Bool("check", false, "check canonical hint parity artifacts")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || *write == *check {
		fmt.Fprintln(stderr, "usage: hint-fixtures exactly one of --write or --check")
		return 2
	}

	manifest, digest, err := game.GenerateHintParityV1()
	if err != nil {
		fmt.Fprintf(stderr, "generate hint parity artifacts: %v\n", err)
		return 1
	}
	artifactDir := filepath.Join(root, "internal", "game", "testdata")
	artifacts := []struct {
		name string
		body []byte
	}{
		{name: manifestName, body: manifest},
		{name: digestName, body: digest},
	}

	if *write {
		for _, artifact := range artifacts {
			path := filepath.Join(artifactDir, artifact.name)
			if err := os.WriteFile(path, artifact.body, 0o644); err != nil {
				fmt.Fprintf(stderr, "write %s: %v\n", artifact.name, err)
				return 1
			}
			if err := os.Chmod(path, 0o644); err != nil {
				fmt.Fprintf(stderr, "chmod %s: %v\n", artifact.name, err)
				return 1
			}
		}
		return 0
	}

	for _, artifact := range artifacts {
		checkedIn, err := os.ReadFile(filepath.Join(artifactDir, artifact.name))
		if err != nil || !bytes.Equal(checkedIn, artifact.body) {
			fmt.Fprintln(stderr, "hint parity artifacts are stale")
			return 1
		}
	}
	_ = stdout
	return 0
}
