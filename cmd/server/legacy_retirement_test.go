package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

const testHistoricalSubmissionWithUserID = `
	CREATE TABLE IF NOT EXISTS submission_attempts (
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
	);
`

const testHistoricalSubmissionAnonymous = `
	CREATE TABLE IF NOT EXISTS submission_attempts (
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
	);
`

var testHistoricalAccountSchema = []string{
	`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			email_verified_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
	`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
	`CREATE TABLE IF NOT EXISTS email_verifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			code_hash TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			consumed_at TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
	`CREATE TABLE IF NOT EXISTS user_preferences (
			user_id INTEGER PRIMARY KEY,
			theme_preference TEXT NOT NULL,
			difficulty_mode TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
	`CREATE TABLE IF NOT EXISTS user_solutions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			puzzle_date TEXT NOT NULL,
			equation TEXT NOT NULL,
			value TEXT NOT NULL,
			solve_time_seconds INTEGER NOT NULL,
			submitted_at TEXT NOT NULL,
			source TEXT NOT NULL,
			UNIQUE (user_id, puzzle_date, equation),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
	`CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);`,
	`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);`,
	`CREATE INDEX IF NOT EXISTS email_verifications_token_hash_idx ON email_verifications (token_hash);`,
	`CREATE INDEX IF NOT EXISTS user_solutions_user_date_idx ON user_solutions (user_id, puzzle_date);`,
}

const testHistoricalSubmissionIndexes = `
	CREATE INDEX IF NOT EXISTS submission_attempts_submitted_at_idx ON submission_attempts (submitted_at);
	CREATE INDEX IF NOT EXISTS submission_attempts_puzzle_status_idx ON submission_attempts (puzzle_date, submission_status);
	CREATE INDEX IF NOT EXISTS submission_attempts_user_id_idx ON submission_attempts (user_id);
`

func TestLegacyRuntimeActivationIsStrict(t *testing.T) {
	tests := []struct {
		value   string
		enabled bool
		wantErr bool
	}{
		{value: ""},
		{value: "confirmed", enabled: true},
		{value: " confirmed", wantErr: true},
		{value: "confirmed ", wantErr: true},
		{value: "CONFIRMED", wantErr: true},
		{value: "true", wantErr: true},
		{value: "0", wantErr: true},
	}
	for _, test := range tests {
		t.Run(fmt.Sprintf("%q", test.value), func(t *testing.T) {
			enabled, err := parseLegacyRetirementActivation(test.value)
			if (err != nil) != test.wantErr {
				t.Fatalf("parseLegacyRetirementActivation(%q) error = %v", test.value, err)
			}
			if enabled != test.enabled {
				t.Fatalf("enabled = %v, want %v", enabled, test.enabled)
			}
		})
	}
}

func TestLegacyRuntimeRejectsBeforeOpeningAStore(t *testing.T) {
	tests := []map[string]string{
		{"RETIRE_LEGACY_ACCOUNT_DATA": "yes"},
		{"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed", "SUBMISSIONS_PATH": filepath.Join(t.TempDir(), "attempts.ndjson")},
		{"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed", "SUBMISSIONS_PATH": filepath.Join(t.TempDir(), "attempts.json")},
		{"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed", "MAX_CONCURRENT_HINT_SOLVES": "0"},
	}
	for index, environment := range tests {
		t.Run(fmt.Sprintf("case-%d", index), func(t *testing.T) {
			openCalls := 0
			_, store, err := initializeRuntime(mapEnvironment(environment), func(string) (*submissionStore, error) {
				openCalls++
				return nil, errors.New("opener must not run")
			})
			if err == nil || store != nil {
				t.Fatalf("initializeRuntime = store %#v, error %v; want nil/error", store, err)
			}
			if openCalls != 0 {
				t.Fatalf("store opener called %d times", openCalls)
			}
		})
	}
}

func TestLegacyRuntimeDisabledNDJSONPreservesExistingBehavior(t *testing.T) {
	path := filepath.Join(t.TempDir(), "submissions.ndjson")
	config, store, err := initializeRuntime(mapEnvironment(map[string]string{"SUBMISSIONS_PATH": path}), openSubmissionStore)
	if err != nil {
		t.Fatalf("initializeRuntime: %v", err)
	}
	t.Cleanup(store.close)
	if config.retireLegacyAccountData {
		t.Fatal("retirement unexpectedly enabled")
	}
	if store.db != nil || store.path != path {
		t.Fatalf("NDJSON store = %#v", store)
	}
	record := submittedSolutionRecord{SubmittedAt: "2026-07-12T00:00:00Z", SubmissionStatus: rejectedSubmission}
	if err := store.append(record); err != nil {
		t.Fatalf("append: %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil || !strings.Contains(string(content), record.SubmittedAt) {
		t.Fatalf("NDJSON content = %q, error %v", content, err)
	}
}

func TestLegacyRuntimeDisabledSQLiteLeavesHistoricalAccountsUntouched(t *testing.T) {
	path := filepath.Join(t.TempDir(), "disabled-legacy.db")
	db := createHistoricalFixture(t, path, "fresh-user-column", true)
	before := snapshotKnownDatabase(t, db)
	db.Close()
	_, store, err := initializeRuntime(mapEnvironment(map[string]string{"SUBMISSIONS_PATH": path}), openSubmissionStore)
	if err != nil {
		t.Fatalf("initializeRuntime: %v", err)
	}
	defer store.close()
	if after := snapshotKnownDatabase(t, store.db); !reflect.DeepEqual(before, after) {
		t.Fatal("disabled retirement changed the historical account database")
	}
}

func TestLegacyDatabaseRawOpenDoesNotEnsureSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "raw.db")
	store, err := openSubmissionStore(path)
	if err != nil {
		t.Fatalf("openSubmissionStore: %v", err)
	}
	t.Cleanup(store.close)
	var objects int
	if err := store.db.QueryRow(`SELECT count(*) FROM sqlite_schema`).Scan(&objects); err != nil {
		t.Fatalf("query sqlite_schema: %v", err)
	}
	if objects != 0 {
		t.Fatalf("raw open created %d schema objects", objects)
	}
}

func TestLegacyDatabaseReferenceInspectionCompletesOnSingleConnection(t *testing.T) {
	result := make(chan error, 1)
	go func() {
		_, err := buildLegacySchemaReference(true)
		result <- err
	}()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("buildLegacySchemaReference: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("schema inspection deadlocked while an index-list cursor held the only connection")
	}
}

func TestLegacyDatabaseEnsureAndRetirementFailuresCloseRawStore(t *testing.T) {
	for _, test := range []struct {
		name string
		env  map[string]string
		ddl  string
	}{
		{name: "ensure", env: map[string]string{}, ddl: `CREATE TABLE submission_attempts (id INTEGER PRIMARY KEY)`},
		{name: "retirement", env: map[string]string{"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed"}, ddl: `CREATE TABLE unrelated (id INTEGER)`},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "failure.db")
			db := openFixtureDatabase(t, path)
			mustExec(t, db, test.ddl)
			db.Close()
			test.env["SUBMISSIONS_PATH"] = path
			var opened *submissionStore
			_, store, err := initializeRuntime(mapEnvironment(test.env), func(path string) (*submissionStore, error) {
				var openErr error
				opened, openErr = openSubmissionStore(path)
				return opened, openErr
			})
			if err == nil || store != nil {
				t.Fatalf("initializeRuntime = %#v, %v; want nil/error", store, err)
			}
			if opened == nil || opened.db.Ping() == nil {
				t.Fatal("raw database was not closed after startup failure")
			}
		})
	}
}

func TestLegacyDatabaseEmptyAndCurrentSchemasAreIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "current.db")
	env := mapEnvironment(map[string]string{
		"SUBMISSIONS_PATH":           path,
		"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed",
	})
	_, store, err := initializeRuntime(env, openSubmissionStore)
	if err != nil {
		t.Fatalf("initialize empty database: %v", err)
	}
	first := snapshotKnownDatabase(t, store.db)
	store.close()

	_, store, err = initializeRuntime(env, openSubmissionStore)
	if err != nil {
		t.Fatalf("initialize current database: %v", err)
	}
	second := snapshotKnownDatabase(t, store.db)
	store.close()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("confirmed current rerun changed database\nfirst: %#v\nsecond: %#v", first, second)
	}
}

func TestLegacyAccountHistoricalVariantsRetireWithoutLosingSubmissions(t *testing.T) {
	for _, variant := range []string{"fresh-user-column", "anonymous-upgrade"} {
		t.Run(variant, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "legacy.db")
			db := createHistoricalFixture(t, path, variant, true)
			beforeRows := snapshotSubmissionRows(t, db)
			beforeSequence := snapshotSequences(t, db)["submission_attempts"]
			db.Close()

			env := mapEnvironment(map[string]string{
				"SUBMISSIONS_PATH":           path,
				"RETIRE_LEGACY_ACCOUNT_DATA": "confirmed",
			})
			_, store, err := initializeRuntime(env, openSubmissionStore)
			if err != nil {
				t.Fatalf("retire historical schema: %v", err)
			}
			if got := snapshotSubmissionRows(t, store.db); !reflect.DeepEqual(got, beforeRows) {
				t.Fatalf("submission rows changed\nbefore: %#v\nafter:  %#v", beforeRows, got)
			}
			assertCurrentOnlySchema(t, store.db)
			sequences := snapshotSequences(t, store.db)
			if len(sequences) != 1 || sequences["submission_attempts"] != beforeSequence {
				t.Fatalf("sequences = %#v, want preserved submission sequence %d", sequences, beforeSequence)
			}
			first := snapshotKnownDatabase(t, store.db)
			store.close()

			_, store, err = initializeRuntime(env, openSubmissionStore)
			if err != nil {
				t.Fatalf("confirmed rerun: %v", err)
			}
			if got := snapshotKnownDatabase(t, store.db); !reflect.DeepEqual(got, first) {
				t.Fatalf("confirmed rerun changed migrated database")
			}
			result, err := store.db.Exec(`INSERT INTO submission_attempts (
				submitted_at, puzzle_date, equation, value, difficulty, hard_mode,
				platform, submission_status
			) VALUES ('2026-07-13T00:00:00Z', '2026-07-13', '1=1', '1', 'easy', 0, 'web', 'accepted')`)
			if err != nil {
				t.Fatalf("append after retirement: %v", err)
			}
			id, err := result.LastInsertId()
			if err != nil || id <= beforeSequence {
				t.Fatalf("new id = %d, error %v; want > %d", id, err, beforeSequence)
			}
			store.close()
		})
	}
}

func TestLegacyAccountLinkedRowsRefuseWithoutMutationOrSecretLeakage(t *testing.T) {
	for _, test := range []struct {
		name string
		link func(*testing.T, *sql.DB, string)
	}{
		{
			name: "user solution",
			link: func(t *testing.T, db *sql.DB, secret string) {
				mustExec(t, db, `INSERT INTO user_solutions (
					id, user_id, puzzle_date, equation, value, solve_time_seconds,
					submitted_at, source
				) VALUES (19, 3, '2026-07-12', ?, '9', 5, '2026-07-12T00:00:00Z', 'sync')`, secret)
			},
		},
		{
			name: "linked submission",
			link: func(t *testing.T, db *sql.DB, _ string) {
				mustExec(t, db, `UPDATE submission_attempts SET user_id = 3 WHERE id = 41`)
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "linked.db")
			db := createHistoricalFixture(t, path, "fresh-user-column", true)
			secret := "secret-account-equation-DO-NOT-LOG"
			test.link(t, db, secret)
			before := snapshotKnownDatabase(t, db)
			err := retireLegacyAccountData(db, legacyRetirementOptions{})
			if err == nil {
				t.Fatal("expected linked-data refusal")
			}
			if strings.Contains(err.Error(), secret) {
				t.Fatalf("error leaked row value: %v", err)
			}
			after := snapshotKnownDatabase(t, db)
			if !reflect.DeepEqual(before, after) {
				t.Fatalf("linked-data refusal mutated database")
			}
			db.Close()
		})
	}
}

func TestLegacyDatabaseUnsupportedVariantsRefuseUnchanged(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, *sql.DB)
	}{
		{name: "missing table", mutate: func(t *testing.T, db *sql.DB) { mustExec(t, db, `DROP TABLE sessions`) }},
		{name: "changed table", mutate: func(t *testing.T, db *sql.DB) { mustExec(t, db, `ALTER TABLE users ADD COLUMN surprise TEXT`) }},
		{name: "sql-only account constraint", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `DROP TABLE users`)
			mustExec(t, db, `CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				email_verified_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				CHECK (length(email) > 0)
			)`)
		}},
		{name: "renamed index", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `DROP INDEX sessions_expires_at_idx`)
			mustExec(t, db, `CREATE INDEX sessions_expiry_idx ON sessions (expires_at)`)
		}},
		{name: "partial index", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `CREATE INDEX extra_partial ON users(email) WHERE email <> ''`)
		}},
		{name: "extra table", mutate: func(t *testing.T, db *sql.DB) { mustExec(t, db, `CREATE TABLE unrelated (id INTEGER)`) }},
		{name: "extra view", mutate: func(t *testing.T, db *sql.DB) { mustExec(t, db, `CREATE VIEW account_view AS SELECT email FROM users`) }},
		{name: "dependent trigger", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `CREATE TRIGGER account_trigger AFTER DELETE ON users BEGIN SELECT 1; END`)
		}},
		{name: "virtual table", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `CREATE VIRTUAL TABLE unrelated_virtual USING rtree(id, min_x, max_x)`)
		}},
		{name: "sqlite statistics", mutate: func(t *testing.T, db *sql.DB) { mustExec(t, db, `ANALYZE`) }},
		{name: "orphan sequence", mutate: func(t *testing.T, db *sql.DB) {
			mustExec(t, db, `INSERT INTO sqlite_sequence(name, seq) VALUES ('orphan', 99)`)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "variant.db")
			db := createHistoricalFixture(t, path, "fresh-user-column", false)
			test.mutate(t, db)
			before := snapshotKnownDatabase(t, db)
			err := retireLegacyAccountData(db, legacyRetirementOptions{})
			if err == nil || !strings.Contains(err.Error(), "unsupported legacy schema variant") {
				t.Fatalf("error = %v, want named unsupported variant", err)
			}
			if after := snapshotKnownDatabase(t, db); !reflect.DeepEqual(before, after) {
				t.Fatal("unsupported variant was mutated")
			}
			db.Close()
		})
	}
}

func TestLegacyDatabaseDuplicateAllowlistedSequenceRowsRefuseUnchanged(t *testing.T) {
	path := filepath.Join(t.TempDir(), "duplicate-sequence.db")
	db := createHistoricalFixture(t, path, "fresh-user-column", false)
	mustExec(t, db, `INSERT INTO sqlite_sequence(name, seq) VALUES ('submission_attempts', 999)`)
	beforeSchema := snapshotSchema(t, db)
	beforeRows := snapshotSubmissionRows(t, db)
	beforeSequences := snapshotAllSequenceRows(t, db)
	err := retireLegacyAccountData(db, legacyRetirementOptions{})
	if err == nil || !strings.Contains(err.Error(), "duplicate sqlite_sequence row submission_attempts") {
		t.Fatalf("error = %v, want named duplicate-sequence refusal", err)
	}
	if !reflect.DeepEqual(beforeSchema, snapshotSchema(t, db)) ||
		!reflect.DeepEqual(beforeRows, snapshotSubmissionRows(t, db)) ||
		!reflect.DeepEqual(beforeSequences, snapshotAllSequenceRows(t, db)) {
		t.Fatal("duplicate sequence refusal mutated the fixture")
	}
	db.Close()
}

func TestLegacyDatabaseMalformedAllowlistedSequenceRowsRefuseUnchanged(t *testing.T) {
	tests := []struct {
		name   string
		mutate string
	}{
		{name: "text sequence", mutate: `UPDATE sqlite_sequence SET seq = CAST(seq AS TEXT) WHERE name = 'submission_attempts'`},
		{name: "null sequence", mutate: `UPDATE sqlite_sequence SET seq = NULL WHERE name = 'submission_attempts'`},
		{name: "blob name", mutate: `UPDATE sqlite_sequence SET name = CAST(name AS BLOB) WHERE name = 'submission_attempts'`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "malformed-sequence.db")
			db := createHistoricalFixture(t, path, "fresh-user-column", false)
			mustExec(t, db, test.mutate)
			beforeSchema := snapshotSchema(t, db)
			beforeRows := snapshotSubmissionRows(t, db)
			beforeSequences := snapshotAllSequenceRowsByStorageClass(t, db)
			err := retireLegacyAccountData(db, legacyRetirementOptions{})
			if err == nil || !strings.Contains(err.Error(), "unsupported legacy schema variant: sqlite_sequence row") {
				t.Fatalf("error = %v, want named malformed-sequence refusal", err)
			}
			if !reflect.DeepEqual(beforeSchema, snapshotSchema(t, db)) ||
				!reflect.DeepEqual(beforeRows, snapshotSubmissionRows(t, db)) ||
				!reflect.DeepEqual(beforeSequences, snapshotAllSequenceRowsByStorageClass(t, db)) {
				t.Fatal("malformed sequence refusal mutated the fixture")
			}
			db.Close()
		})
	}
}

func TestLegacyDatabaseFingerprintIgnoresOnlyVolatileIndexLocationsAndEnumeration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "volatile-index.db")
	store, err := newSubmissionStore(path)
	if err != nil {
		t.Fatalf("newSubmissionStore: %v", err)
	}
	defer store.close()
	mustExec(t, store.db, `INSERT INTO submission_attempts (
		submitted_at, puzzle_date, equation, value, difficulty, hard_mode, platform, submission_status
	) VALUES ('now', '2026-07-12', '1=1', '1', 'easy', 0, 'web', 'accepted')`)
	beforeObjects, err := captureLegacySchemaObjects(context.Background(), store.db)
	if err != nil {
		t.Fatalf("capture objects: %v", err)
	}
	before, err := captureLegacySchemaFingerprint(context.Background(), store.db, beforeObjects)
	if err != nil {
		t.Fatalf("capture fingerprint: %v", err)
	}
	volatileBefore := snapshotVolatileIndexState(t, store.db)

	mustExec(t, store.db, `DROP INDEX submission_attempts_submitted_at_idx`)
	mustExec(t, store.db, `DROP INDEX submission_attempts_puzzle_status_idx`)
	mustExec(t, store.db, `CREATE TABLE page_padding (value TEXT)`)
	mustExec(t, store.db, `WITH RECURSIVE values_to_insert(value) AS (
		SELECT 1 UNION ALL SELECT value + 1 FROM values_to_insert WHERE value < 250
	) INSERT INTO page_padding(value) SELECT printf('%0800d', value) FROM values_to_insert`)
	mustExec(t, store.db, `CREATE INDEX submission_attempts_puzzle_status_idx ON submission_attempts (puzzle_date, submission_status)`)
	mustExec(t, store.db, `CREATE INDEX submission_attempts_submitted_at_idx ON submission_attempts (submitted_at)`)
	mustExec(t, store.db, `DROP TABLE page_padding`)

	afterObjects, err := captureLegacySchemaObjects(context.Background(), store.db)
	if err != nil {
		t.Fatalf("recapture objects: %v", err)
	}
	after, err := captureLegacySchemaFingerprint(context.Background(), store.db, afterObjects)
	if err != nil {
		t.Fatalf("recapture fingerprint: %v", err)
	}
	volatileAfter := snapshotVolatileIndexState(t, store.db)
	if reflect.DeepEqual(volatileBefore, volatileAfter) {
		t.Fatal("fixture did not change an index root page or enumeration sequence")
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("semantic fingerprint changed with only volatile root pages/enumeration")
	}
}

func TestLegacyRetirementInjectedFailureRollsBackDestructiveDDL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rollback.db")
	db := createHistoricalFixture(t, path, "anonymous-upgrade", true)
	before := snapshotKnownDatabase(t, db)
	sentinel := errors.New("injected post-DDL failure")
	err := retireLegacyAccountData(db, legacyRetirementOptions{
		afterDestructiveDDL: func() error { return sentinel },
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("retirement error = %v, want %v", err, sentinel)
	}
	after := snapshotKnownDatabase(t, db)
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("rollback changed logical snapshot")
	}
	assertIntegrity(t, db)
	db.Close()
}

func TestLegacyRetirementBeginImmediatePreventsConcurrentWriter(t *testing.T) {
	path := filepath.Join(t.TempDir(), "race.db")
	db := createHistoricalFixture(t, path, "fresh-user-column", false)
	preflight := make(chan struct{})
	release := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		result <- retireLegacyAccountData(db, legacyRetirementOptions{
			afterFinalPreflight: func() error {
				close(preflight)
				<-release
				return nil
			},
		})
	}()
	select {
	case <-preflight:
	case <-time.After(5 * time.Second):
		t.Fatal("retirement did not reach final preflight")
	}

	writer := openFixtureDatabase(t, path)
	mustExec(t, writer, `PRAGMA busy_timeout = 50`)
	_, writerErr := writer.Exec(`INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ('racer@example.test', 'hash', 'now', 'now')`)
	if writerErr == nil {
		close(release)
		t.Fatal("concurrent writer succeeded during BEGIN IMMEDIATE")
	}
	writer.Close()
	close(release)
	if err := <-result; err != nil {
		t.Fatalf("retirement after blocked writer: %v", err)
	}
	assertCurrentOnlySchema(t, db)
	db.Close()
}

type testDatabaseSnapshot struct {
	Schema      []string
	Sequences   map[string]int64
	Submissions [][]string
	KnownRows   map[string][][]string
}

func createHistoricalFixture(t *testing.T, path string, variant string, populateAccounts bool) *sql.DB {
	t.Helper()
	db := openFixtureDatabase(t, path)
	if variant == "fresh-user-column" {
		mustExec(t, db, testHistoricalSubmissionWithUserID)
	} else if variant == "anonymous-upgrade" {
		mustExec(t, db, testHistoricalSubmissionAnonymous)
		mustExec(t, db, `ALTER TABLE submission_attempts ADD COLUMN user_id INTEGER`)
	} else {
		t.Fatalf("unknown historical fixture variant %q", variant)
	}
	mustExec(t, db, testHistoricalSubmissionIndexes)
	for _, statement := range testHistoricalAccountSchema {
		mustExec(t, db, statement)
	}
	mustExec(t, db, `INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status,
		rejection_reason, user_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
		7, []byte{0, 1, 2}, "", "1=1", "", nil, []byte("easy"), 1.5, "web", nil, "accepted", []byte{})
	mustExec(t, db, `INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status,
		rejection_reason, user_id
	) VALUES (41, '2026-07-12T00:00:00Z', '2026-07-12', '5+4=9', '9', '', 'hard', 1, 'ios', '', 'rejected', NULL, NULL)`)
	if populateAccounts {
		mustExec(t, db, `INSERT INTO users (id, email, password_hash, email_verified_at, created_at, updated_at)
			VALUES (3, 'sentinel-user@example.test', 'sentinel-password-hash', NULL, 'created', 'updated')`)
		mustExec(t, db, `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
			VALUES (8, 3, 'sentinel-session-token', 'expires', 'created')`)
		mustExec(t, db, `INSERT INTO email_verifications (id, user_id, token_hash, code_hash, expires_at, consumed_at, created_at)
			VALUES (9, 3, 'sentinel-verification-token', 'sentinel-code', 'expires', NULL, 'created')`)
		mustExec(t, db, `INSERT INTO user_preferences (user_id, theme_preference, difficulty_mode, updated_at)
			VALUES (3, 'dark', 'hard', 'updated')`)
	}
	return db
}

func openFixtureDatabase(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatalf("ping fixture: %v", err)
	}
	return db
}

func mustExec(t *testing.T, db *sql.DB, statement string, args ...any) {
	t.Helper()
	if _, err := db.Exec(statement, args...); err != nil {
		t.Fatalf("execute fixture statement: %v\n%s", err, statement)
	}
}

func snapshotKnownDatabase(t *testing.T, db *sql.DB) testDatabaseSnapshot {
	t.Helper()
	return testDatabaseSnapshot{
		Schema:      snapshotSchema(t, db),
		Sequences:   snapshotSequences(t, db),
		Submissions: snapshotSubmissionRows(t, db),
		KnownRows: map[string][][]string{
			"users":               snapshotTableRows(t, db, "users"),
			"sessions":            snapshotTableRows(t, db, "sessions"),
			"email_verifications": snapshotTableRows(t, db, "email_verifications"),
			"user_preferences":    snapshotTableRows(t, db, "user_preferences"),
			"user_solutions":      snapshotTableRows(t, db, "user_solutions"),
		},
	}
}

func snapshotSchema(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT type, name, tbl_name, coalesce(sql, '<NULL>') FROM sqlite_schema ORDER BY type, name`)
	if err != nil {
		t.Fatalf("query schema: %v", err)
	}
	defer rows.Close()
	var result []string
	for rows.Next() {
		var objectType, name, table, sqlText string
		if err := rows.Scan(&objectType, &name, &table, &sqlText); err != nil {
			t.Fatalf("scan schema: %v", err)
		}
		result = append(result, strings.Join([]string{objectType, name, table, sqlText}, "\x00"))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate schema: %v", err)
	}
	return result
}

func snapshotSequences(t *testing.T, db *sql.DB) map[string]int64 {
	t.Helper()
	result := map[string]int64{}
	var exists int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'`).Scan(&exists); err != nil {
		t.Fatalf("locate sqlite_sequence: %v", err)
	}
	if exists == 0 {
		return result
	}
	rows, err := db.Query(`SELECT name, seq FROM sqlite_sequence ORDER BY name`)
	if err != nil {
		t.Fatalf("query sqlite_sequence: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var sequence int64
		if err := rows.Scan(&name, &sequence); err != nil {
			t.Fatalf("scan sqlite_sequence: %v", err)
		}
		result[name] = sequence
	}
	return result
}

func snapshotAllSequenceRows(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT name, seq FROM sqlite_sequence ORDER BY name, seq`)
	if err != nil {
		t.Fatalf("query all sqlite_sequence rows: %v", err)
	}
	defer rows.Close()
	var result []string
	for rows.Next() {
		var name string
		var sequence int64
		if err := rows.Scan(&name, &sequence); err != nil {
			t.Fatalf("scan all sqlite_sequence rows: %v", err)
		}
		result = append(result, fmt.Sprintf("%s:%d", name, sequence))
	}
	return result
}

func snapshotAllSequenceRowsByStorageClass(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT typeof(name), quote(name), typeof(seq), quote(seq) FROM sqlite_sequence ORDER BY rowid`)
	if err != nil {
		t.Fatalf("query typed sqlite_sequence rows: %v", err)
	}
	defer rows.Close()
	var result []string
	for rows.Next() {
		var nameType, nameValue, sequenceType, sequenceValue string
		if err := rows.Scan(&nameType, &nameValue, &sequenceType, &sequenceValue); err != nil {
			t.Fatalf("scan typed sqlite_sequence rows: %v", err)
		}
		result = append(result, strings.Join([]string{nameType, nameValue, sequenceType, sequenceValue}, ":"))
	}
	return result
}

func snapshotSubmissionRows(t *testing.T, db *sql.DB) [][]string {
	t.Helper()
	return snapshotSelectedTableRows(t, db, "submission_attempts", []string{
		"id", "submitted_at", "puzzle_date", "equation", "value", "solve_time_seconds",
		"difficulty", "hard_mode", "platform", "app_version", "submission_status", "rejection_reason",
	})
}

func snapshotTableRows(t *testing.T, db *sql.DB, table string) [][]string {
	t.Helper()
	var exists int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_schema WHERE type='table' AND name=?`, table).Scan(&exists); err != nil {
		t.Fatalf("locate table %s: %v", table, err)
	}
	if exists == 0 {
		return nil
	}
	columns, err := db.Query(`SELECT name FROM pragma_table_xinfo(?) ORDER BY cid`, table)
	if err != nil {
		t.Fatalf("columns for %s: %v", table, err)
	}
	var expressions []string
	for columns.Next() {
		var name string
		if err := columns.Scan(&name); err != nil {
			t.Fatalf("scan column for %s: %v", table, err)
		}
		expressions = append(expressions, name)
	}
	columns.Close()
	return snapshotSelectedTableRows(t, db, table, expressions)
}

func snapshotSelectedTableRows(t *testing.T, db *sql.DB, table string, columns []string) [][]string {
	t.Helper()
	if len(columns) == 0 {
		return nil
	}
	var expressions []string
	for _, name := range columns {
		quoted := `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
		expressions = append(expressions, `typeof(`+quoted+`)`, `quote(`+quoted+`)`)
	}
	quotedTable := `"` + strings.ReplaceAll(table, `"`, `""`) + `"`
	rows, err := db.Query(`SELECT ` + strings.Join(expressions, ", ") + ` FROM ` + quotedTable + ` ORDER BY rowid`)
	if err != nil {
		t.Fatalf("snapshot rows for %s: %v", table, err)
	}
	defer rows.Close()
	var result [][]string
	for rows.Next() {
		values := make([]string, len(expressions))
		destinations := make([]any, len(values))
		for index := range values {
			destinations[index] = &values[index]
		}
		if err := rows.Scan(destinations...); err != nil {
			t.Fatalf("scan rows for %s: %v", table, err)
		}
		result = append(result, values)
	}
	return result
}

func assertCurrentOnlySchema(t *testing.T, db *sql.DB) {
	t.Helper()
	var names []string
	rows, err := db.Query(`SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatalf("query current schema: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan current schema: %v", err)
		}
		names = append(names, name)
	}
	want := []string{"submission_attempts", "submission_attempts_puzzle_status_idx", "submission_attempts_submitted_at_idx"}
	sort.Strings(want)
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("current schema names = %#v, want %#v", names, want)
	}
	columns, err := db.Query(`SELECT name FROM pragma_table_xinfo('submission_attempts') ORDER BY cid`)
	if err != nil {
		t.Fatalf("query current columns: %v", err)
	}
	defer columns.Close()
	for columns.Next() {
		var name string
		if err := columns.Scan(&name); err != nil {
			t.Fatalf("scan current column: %v", err)
		}
		if name == "user_id" {
			t.Fatal("retired user_id column remains")
		}
	}
	assertIntegrity(t, db)
}

func assertIntegrity(t *testing.T, db *sql.DB) {
	t.Helper()
	var quickCheck string
	if err := db.QueryRow(`PRAGMA quick_check`).Scan(&quickCheck); err != nil || quickCheck != "ok" {
		t.Fatalf("quick_check = %q, error %v", quickCheck, err)
	}
	rows, err := db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign_key_check: %v", err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign_key_check returned a violation")
	}
}

func snapshotVolatileIndexState(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`
		SELECT il.seq, il.name, schema.rootpage
		FROM pragma_index_list('submission_attempts') AS il
		JOIN sqlite_schema AS schema ON schema.type = 'index' AND schema.name = il.name
		ORDER BY il.name
	`)
	if err != nil {
		t.Fatalf("query volatile index state: %v", err)
	}
	defer rows.Close()
	var result []string
	for rows.Next() {
		var sequence, rootPage int
		var name string
		if err := rows.Scan(&sequence, &name, &rootPage); err != nil {
			t.Fatalf("scan volatile index state: %v", err)
		}
		result = append(result, fmt.Sprintf("%d:%s:%d", sequence, name, rootPage))
	}
	return result
}
