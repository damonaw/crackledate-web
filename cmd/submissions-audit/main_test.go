package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crackledate-web/internal/submissionevidence"
	"crackledate-web/internal/submissionfixture"
	_ "modernc.org/sqlite"
)

const auditCurrentTableSQL = `CREATE TABLE submission_attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	submitted_at TEXT NOT NULL,
	puzzle_date TEXT NOT NULL,
	equation TEXT NOT NULL,
	value TEXT NOT NULL,
	solve_time_seconds INTEGER,
	difficulty TEXT NOT NULL,
	hard_mode INTEGER NOT NULL,
	platform TEXT NOT NULL,
	app_version TEXT,
	submission_status TEXT NOT NULL,
	rejection_reason TEXT
)`

const auditHistoricalTableSQL = `CREATE TABLE submission_attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	submitted_at TEXT NOT NULL,
	puzzle_date TEXT NOT NULL,
	equation TEXT NOT NULL,
	value TEXT NOT NULL,
	solve_time_seconds INTEGER,
	difficulty TEXT NOT NULL,
	hard_mode INTEGER NOT NULL,
	platform TEXT NOT NULL,
	app_version TEXT,
	submission_status TEXT NOT NULL,
	rejection_reason TEXT,
	user_id INTEGER
)`

func TestRunAuditPrintsLiteralGoldenOutputForCurrentAndHistoricalSchemas(t *testing.T) {
	constructors := []struct {
		name string
		ddl  func(*testing.T, *sql.DB)
	}{
		{name: "current", ddl: func(t *testing.T, db *sql.DB) { mustAuditExec(t, db, auditCurrentTableSQL) }},
		{name: "historical direct", ddl: func(t *testing.T, db *sql.DB) { mustAuditExec(t, db, auditHistoricalTableSQL) }},
		{name: "historical upgraded", ddl: func(t *testing.T, db *sql.DB) {
			mustAuditExec(t, db, auditCurrentTableSQL)
			mustAuditExec(t, db, `ALTER TABLE submission_attempts ADD COLUMN user_id INTEGER`)
		}},
		{name: "current native drop", ddl: func(t *testing.T, db *sql.DB) {
			mustAuditExec(t, db, auditHistoricalTableSQL)
			mustAuditExec(t, db, `ALTER TABLE submission_attempts DROP COLUMN user_id`)
		}},
	}
	for _, constructor := range constructors {
		t.Run(constructor.name, func(t *testing.T) {
			path, db := newAuditFixture(t)
			constructor.ddl(t, db)
			insertAuditMixedRows(t, db, strings.Contains(constructor.name, "historical"))
			closeAuditFixture(t, db)

			var stdout bytes.Buffer
			if err := runAudit([]string{path}, &stdout, nil); err != nil {
				t.Fatalf("runAudit: %v", err)
			}
			const want = "submission_count=2\nsubmission_sha256=816f12befd64dac5a1b7f17ddf5f9b84a768b5049e7d7883884e327b213fd814\n"
			if stdout.String() != want {
				t.Fatalf("stdout = %q, want %q", stdout.String(), want)
			}
		})
	}
}

func TestRunAuditEmptyLiteralGolden(t *testing.T) {
	path, db := newAuditFixture(t)
	mustAuditExec(t, db, auditCurrentTableSQL)
	closeAuditFixture(t, db)
	var stdout bytes.Buffer
	if err := runAudit([]string{path}, &stdout, nil); err != nil {
		t.Fatalf("runAudit: %v", err)
	}
	const want = "submission_count=0\nsubmission_sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"
	if stdout.String() != want {
		t.Fatalf("stdout = %q, want %q", stdout.String(), want)
	}
}

func TestRunAuditRequiresExactlyOneExplicitGuardedPath(t *testing.T) {
	path, db := newAuditFixture(t)
	mustAuditExec(t, db, auditCurrentTableSQL)
	closeAuditFixture(t, db)
	for _, args := range [][]string{nil, {}, {path, path}} {
		var stdout bytes.Buffer
		if err := runAudit(args, &stdout, nil); err == nil {
			t.Fatalf("runAudit(%q) unexpectedly succeeded", args)
		}
		if stdout.Len() != 0 {
			t.Fatalf("failure wrote stdout %q", stdout.String())
		}
	}
	if err := runAudit([]string{path}, &bytes.Buffer{}, []string{path}); err == nil {
		t.Fatal("known live path unexpectedly accepted")
	}
}

func TestRunAuditRejectsCheckoutShapedLivePathFromAnUnrelatedWorkingDirectory(t *testing.T) {
	root := canonicalAuditTempDir(t)
	dataDirectory := filepath.Join(root, "data")
	if err := os.Mkdir(dataDirectory, 0o700); err != nil {
		t.Fatalf("Mkdir data: %v", err)
	}
	path := filepath.Join(dataDirectory, "submissions.db")
	db, err := sql.Open("sqlite", createAuditURI(path))
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	mustAuditExec(t, db, auditCurrentTableSQL)
	closeAuditFixture(t, db)
	unrelated := canonicalAuditTempDir(t)
	t.Chdir(unrelated)
	if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err == nil {
		t.Fatal("data/submissions.db unexpectedly accepted away from the checkout cwd")
	}
}

func TestAuditOpenerIsImmutableAndReadOnlyWithMetacharacterPath(t *testing.T) {
	path := filepath.Join(canonicalAuditTempDir(t), "copied ?#%&mode=rw.db")
	db, err := sql.Open("sqlite", createAuditURI(path))
	if err != nil {
		t.Fatalf("create fixture open: %v", err)
	}
	mustAuditExec(t, db, auditCurrentTableSQL)
	closeAuditFixture(t, db)

	readonly, err := openAuditDatabase(path)
	if err != nil {
		t.Fatalf("openAuditDatabase: %v", err)
	}
	defer readonly.Close()
	if _, err := readonly.Exec(`CREATE TABLE forbidden_write (id INTEGER)`); err == nil {
		t.Fatal("DDL unexpectedly succeeded through production audit opener")
	}
	if _, err := os.Stat(path + "-wal"); !os.IsNotExist(err) {
		t.Fatalf("audit opener created WAL sidecar: %v", err)
	}
	if _, err := os.Stat(path + "-shm"); !os.IsNotExist(err) {
		t.Fatalf("audit opener created SHM sidecar: %v", err)
	}
}

func TestRunAuditPreservesBytesMtimeAndSidecarAbsence(t *testing.T) {
	path, db := newAuditFixture(t)
	mustAuditExec(t, db, auditCurrentTableSQL)
	insertAuditMixedRows(t, db, false)
	closeAuditFixture(t, db)
	contentBefore, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile before: %v", err)
	}
	statBefore, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat before: %v", err)
	}
	stableMtime := time.Unix(statBefore.ModTime().Unix()-60, 123)
	if err := os.Chtimes(path, stableMtime, stableMtime); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}

	if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err != nil {
		t.Fatalf("runAudit: %v", err)
	}
	contentAfter, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile after: %v", err)
	}
	statAfter, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat after: %v", err)
	}
	if !bytes.Equal(contentBefore, contentAfter) || !statAfter.ModTime().Equal(stableMtime) {
		t.Fatalf("audit changed fixture bytes or mtime")
	}
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if _, err := os.Lstat(path + suffix); !os.IsNotExist(err) {
			t.Fatalf("audit created sidecar %s: %v", suffix, err)
		}
	}
}

func TestRunAuditRejectsUnsupportedSchemaShapes(t *testing.T) {
	tests := []struct {
		name string
		ddl  string
	}{
		{name: "missing id", ddl: strings.Replace(auditCurrentTableSQL, "id INTEGER PRIMARY KEY AUTOINCREMENT,", "", 1)},
		{name: "wrong id type", ddl: strings.Replace(auditCurrentTableSQL, "id INTEGER PRIMARY KEY AUTOINCREMENT", "id TEXT PRIMARY KEY", 1)},
		{name: "non-primary id", ddl: strings.Replace(auditCurrentTableSQL, "id INTEGER PRIMARY KEY AUTOINCREMENT", "id INTEGER", 1)},
		{name: "non-rowid descending primary key", ddl: strings.Replace(auditCurrentTableSQL, "id INTEGER PRIMARY KEY AUTOINCREMENT", "id INTEGER PRIMARY KEY DESC", 1)},
		{name: "wrong retained type", ddl: strings.Replace(auditCurrentTableSQL, "equation TEXT NOT NULL", "equation BLOB NOT NULL", 1)},
		{name: "unsupported trailing", ddl: strings.Replace(auditCurrentTableSQL, "\n)", ",\n\tsurprise TEXT\n)", 1)},
		{name: "generated replacement", ddl: strings.Replace(auditCurrentTableSQL, "app_version TEXT,", "app_version TEXT GENERATED ALWAYS AS (platform) STORED,", 1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path, db := newAuditFixture(t)
			mustAuditExec(t, db, test.ddl)
			closeAuditFixture(t, db)
			if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err == nil {
				t.Fatal("unsupported schema unexpectedly accepted")
			}
		})
	}
}

func TestRunAuditRejectsViewAndVirtualTableSubstitutions(t *testing.T) {
	t.Run("view", func(t *testing.T) {
		path, db := newAuditFixture(t)
		mustAuditExec(t, db, `CREATE TABLE source (id INTEGER)`)
		mustAuditExec(t, db, `CREATE VIEW submission_attempts AS SELECT id, '' AS submitted_at, '' AS puzzle_date, '' AS equation, '' AS value, NULL AS solve_time_seconds, '' AS difficulty, 0 AS hard_mode, '' AS platform, NULL AS app_version, '' AS submission_status, NULL AS rejection_reason FROM source`)
		closeAuditFixture(t, db)
		if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err == nil {
			t.Fatal("view unexpectedly accepted")
		}
	})
	t.Run("virtual table", func(t *testing.T) {
		path, db := newAuditFixture(t)
		mustAuditExec(t, db, `CREATE VIRTUAL TABLE submission_attempts USING rtree(id, min_value, max_value)`)
		closeAuditFixture(t, db)
		if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err == nil {
			t.Fatal("virtual table unexpectedly accepted")
		}
	})
}

func TestRunAuditRequiresQuickAndForeignKeyChecks(t *testing.T) {
	path, db := newAuditFixture(t)
	mustAuditExec(t, db, auditCurrentTableSQL)
	mustAuditExec(t, db, `CREATE TABLE parent (id INTEGER PRIMARY KEY)`)
	mustAuditExec(t, db, `CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))`)
	mustAuditExec(t, db, `PRAGMA foreign_keys=OFF`)
	mustAuditExec(t, db, `INSERT INTO child(parent_id) VALUES (99)`)
	closeAuditFixture(t, db)
	if err := runAudit([]string{path}, &bytes.Buffer{}, nil); err == nil {
		t.Fatal("foreign-key violation unexpectedly accepted")
	}
}

func TestExactQuickCheckRequiresOneLiteralOKResult(t *testing.T) {
	for _, test := range []struct {
		name    string
		results []string
		want    bool
	}{
		{name: "exact", results: []string{"ok"}, want: true},
		{name: "empty"},
		{name: "uppercase", results: []string{"OK"}},
		{name: "whitespace", results: []string{"ok "}},
		{name: "additional", results: []string{"ok", "ok"}},
		{name: "malformed", results: []string{"database disk image is malformed"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := exactQuickCheck(test.results); got != test.want {
				t.Fatalf("exactQuickCheck(%q) = %v, want %v", test.results, got, test.want)
			}
		})
	}
}

func TestRunAuditErrorsRedactPathsDSNsRowsAndEnvironment(t *testing.T) {
	sentinelPath := filepath.Join(canonicalAuditTempDir(t), "secret-path-token?mode=rw.db")
	db, err := sql.Open("sqlite", sentinelPath)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	mustAuditExec(t, db, strings.Replace(auditCurrentTableSQL, "equation TEXT NOT NULL", "equation BLOB NOT NULL DEFAULT 'secret-row-token'", 1))
	closeAuditFixture(t, db)
	t.Setenv("SECRET_ENV_TOKEN", "secret-environment-value")
	err = runAudit([]string{sentinelPath}, &bytes.Buffer{}, nil)
	if err == nil {
		t.Fatal("expected audit failure")
	}
	for _, forbidden := range []string{sentinelPath, submissionfixture.ReadOnlyURI(sentinelPath), "secret-path-token", "secret-row-token", "secret-environment-value"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("diagnostic %q leaked %q", err, forbidden)
		}
	}
}

func TestCanonicalEvidenceMatchesLiteralIndependently(t *testing.T) {
	path, db := newAuditFixture(t)
	mustAuditExec(t, db, auditCurrentTableSQL)
	insertAuditMixedRows(t, db, false)
	evidence, err := submissionevidence.Capture(context.Background(), db)
	if err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if evidence.Count != 2 || fmt.Sprintf("%x", evidence.Digest) != "816f12befd64dac5a1b7f17ddf5f9b84a768b5049e7d7883884e327b213fd814" {
		t.Fatalf("unexpected literal evidence %d/%x", evidence.Count, evidence.Digest)
	}
	closeAuditFixture(t, db)
	fileBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if sha256.Sum256(fileBytes) == evidence.Digest {
		t.Fatal("row evidence unexpectedly equals whole-file hash")
	}
}

func newAuditFixture(t *testing.T) (string, *sql.DB) {
	t.Helper()
	path := filepath.Join(canonicalAuditTempDir(t), "fixture.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("sql.Open fixture: %v", err)
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatalf("Ping fixture: %v", err)
	}
	return path, db
}

func canonicalAuditTempDir(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	return root
}

func createAuditURI(path string) string {
	return (&url.URL{Scheme: "file", Path: path, RawQuery: url.Values{"mode": {"rwc"}}.Encode()}).String()
}

func closeAuditFixture(t *testing.T, db *sql.DB) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Fatalf("Close fixture: %v", err)
	}
}

func mustAuditExec(t *testing.T, db *sql.DB, statement string, args ...any) {
	t.Helper()
	if _, err := db.Exec(statement, args...); err != nil {
		t.Fatalf("Exec fixture: %v\n%s", err, statement)
	}
}

func insertAuditMixedRows(t *testing.T, db *sql.DB, historical bool) {
	t.Helper()
	columns := `id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status, rejection_reason`
	placeholders := `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`
	if historical {
		columns += `, user_id`
		placeholders += `, NULL`
	}
	statement := `INSERT INTO submission_attempts (` + columns + `) VALUES (` + placeholders + `)`
	if _, err := db.Exec(statement, 7, []byte{0, 1, 2}, "", "1=1", "", nil, []byte("easy"), 1.5, "web", nil, "accepted", []byte{}); err != nil {
		t.Fatalf("insert mixed row one: %v", err)
	}
	statement = `INSERT INTO submission_attempts (` + columns + `) VALUES (`
	args := `41, '2026-07-12T00:00:00Z', '2026-07-12', '5+4=9', '9', '', 'hard', 1, 'ios', '', 'rejected', NULL`
	if historical {
		args += `, NULL`
	}
	if _, err := db.Exec(statement + args + `)`); err != nil {
		t.Fatalf("insert mixed row two: %v", err)
	}
}
