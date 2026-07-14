package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"crackledate-web/internal/submissionevidence"
	"crackledate-web/internal/submissionfixture"
	_ "modernc.org/sqlite"
)

const reconcileTableSQL = `CREATE TABLE submission_attempts (
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

func TestRunReconcileRequiresExactConfirmationPathAndNonzeroOwner(t *testing.T) {
	path := makePlainReconcileSet(t)
	uid, gid := uint32(os.Geteuid()), uint32(os.Getegid())
	for _, test := range []struct {
		name string
		args []string
		uid  uint32
		gid  uint32
	}{
		{name: "missing", uid: uid, gid: gid},
		{name: "path only", args: []string{path}, uid: uid, gid: gid},
		{name: "wrong token", args: []string{"--confirm", path}, uid: uid, gid: gid},
		{name: "reversed", args: []string{path, "--confirm-disposable-copy"}, uid: uid, gid: gid},
		{name: "extra", args: []string{"--confirm-disposable-copy", path, path}, uid: uid, gid: gid},
		{name: "root uid", args: []string{"--confirm-disposable-copy", path}, uid: 0, gid: gid},
		{name: "root gid", args: []string{"--confirm-disposable-copy", path}, uid: uid, gid: 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := runReconcile(test.args, nil, test.uid, test.gid); err != errReconcileInvocation {
				t.Fatalf("runReconcile error = %v, want exact invocation refusal", err)
			}
		})
	}
}

func TestOpenReconcileDatabaseUsesEscapedReadWriteNoCreateURI(t *testing.T) {
	root := canonicalReconcileTempDir(t)
	path := filepath.Join(root, "copy ?#%&mode=ro.db")
	if _, err := openReconcileDatabase(path); err == nil {
		t.Fatal("mode=rw unexpectedly created a missing database")
	}
	db, err := sql.Open("sqlite", createReconcileURI(path))
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE existing (id INTEGER)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close fixture: %v", err)
	}
	reopened, err := openReconcileDatabase(path)
	if err != nil {
		t.Fatalf("openReconcileDatabase: %v", err)
	}
	defer reopened.Close()
	if _, err := reopened.Exec(`INSERT INTO existing(id) VALUES (1)`); err != nil {
		t.Fatalf("read-write opener did not open the escaped original path: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "copy ")); !os.IsNotExist(err) {
		t.Fatalf("query injection created an unintended path: %v", err)
	}
}

func TestReconcileAliasedWALAndSHMRefuseBeforeOpenAndPreserveSentinels(t *testing.T) {
	for _, sidecar := range []string{"-wal", "-shm"} {
		for _, alias := range []string{"hardlink", "symlink"} {
			t.Run(strings.TrimPrefix(sidecar, "-")+" "+alias, func(t *testing.T) {
				path := makePlainReconcileSet(t)
				sentinelPath := filepath.Join(filepath.Dir(path), "sentinel-source")
				sentinel := []byte("source-or-archive-sentinel")
				if err := os.WriteFile(sentinelPath, sentinel, 0o600); err != nil {
					t.Fatalf("write sentinel: %v", err)
				}
				if err := os.Remove(path + sidecar); err != nil {
					t.Fatalf("remove original sidecar: %v", err)
				}
				var err error
				if alias == "hardlink" {
					err = os.Link(sentinelPath, path+sidecar)
				} else {
					err = os.Symlink(sentinelPath, path+sidecar)
				}
				if err != nil {
					t.Fatalf("create alias: %v", err)
				}
				openCalls := 0
				hooks := reconcileHooks{open: func(string) (*sql.DB, error) {
					openCalls++
					return sql.Open("sqlite", ":memory:")
				}}
				err = reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
				if err == nil {
					t.Fatal("aliased sidecar unexpectedly accepted")
				}
				if openCalls != 0 {
					t.Fatalf("database opener called %d times before alias refusal", openCalls)
				}
				if got, readErr := os.ReadFile(sentinelPath); readErr != nil || !bytes.Equal(got, sentinel) {
					t.Fatalf("sentinel changed: %q, %v", got, readErr)
				}
				if _, lstatErr := os.Lstat(path + sidecar); lstatErr != nil {
					t.Fatalf("aliased sidecar was removed: %v", lstatErr)
				}
			})
		}
	}
}

func TestReconcileFailureResultsNeverUnlinkOrChangeSidecars(t *testing.T) {
	tests := []struct {
		name       string
		checkpoint checkpointResult
	}{
		{name: "busy", checkpoint: checkpointResult{Busy: 1}},
		{name: "log frames", checkpoint: checkpointResult{Log: 1}},
		{name: "checkpointed frames", checkpoint: checkpointResult{Checkpointed: 1}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := makePlainReconcileSet(t)
			before := snapshotReconcileSet(t, path)
			hooks := reconcileHooks{
				open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
				checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
					return test.checkpoint, nil
				},
			}
			err := reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
			if err == nil {
				t.Fatal("expected checkpoint-result refusal")
			}
			assertReconcileSetUnchanged(t, path, before)
		})
	}
}

func TestReconcileExactCheckpointStillRefusesNonemptyWALWithoutUnlink(t *testing.T) {
	path := makePlainReconcileSet(t)
	before := snapshotReconcileSet(t, path)
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			return checkpointResult{}, nil
		},
	}
	err := reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
	if err == nil {
		t.Fatal("expected nonempty-WAL refusal")
	}
	assertReconcileSetUnchanged(t, path, before)
}

func TestReconcileSuccessfulCloseValidatesAndRemovesRemainingEmptyWALAndNonemptySHM(t *testing.T) {
	path := makePlainReconcileSet(t)
	const normalSHMSize = 32 * 1024
	if err := os.Truncate(path+"-wal", 0); err != nil {
		t.Fatalf("truncate WAL: %v", err)
	}
	if err := os.WriteFile(path+"-shm", make([]byte, normalSHMSize), 0o600); err != nil {
		t.Fatalf("write normal-sized SHM: %v", err)
	}
	shmBefore, err := os.Stat(path + "-shm")
	if err != nil || shmBefore.Size() != normalSHMSize {
		t.Fatalf("SHM size before reconciliation = %#v, %v; want %d", shmBefore, err, normalSHMSize)
	}
	observedAfterClose := false
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			return checkpointResult{}, nil
		},
		beforeCleanup: func(guarded submissionfixture.ReconcileSet) {
			wal, walErr := os.Stat(guarded.WAL.Path)
			shm, shmErr := os.Stat(guarded.SHM.Path)
			if walErr != nil || shmErr != nil || wal.Size() != 0 || shm.Size() != normalSHMSize {
				t.Fatalf("post-close sidecars = WAL %#v/%v SHM %#v/%v", wal, walErr, shm, shmErr)
			}
			observedAfterClose = true
		},
	}
	owner := submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}
	if err := reconcileFixture(path, nil, owner, hooks); err != nil {
		t.Fatalf("reconcileFixture: %v", err)
	}
	if !observedAfterClose {
		t.Fatal("did not observe remaining sidecars after successful close")
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		if _, err := os.Lstat(path + suffix); !os.IsNotExist(err) {
			t.Fatalf("sidecar %s remains after guarded cleanup: %v", suffix, err)
		}
	}
}

func TestReconcileSecondCleanupFailureReturnsGenericErrorAndLeavesDiscardRequiredCopyGuarded(t *testing.T) {
	path := makePlainReconcileSet(t)
	if err := os.Truncate(path+"-wal", 0); err != nil {
		t.Fatalf("truncate WAL: %v", err)
	}
	owner := submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}
	guarded, err := submissionfixture.GuardReconcile(path, nil, owner)
	if err != nil {
		t.Fatalf("guard fixture: %v", err)
	}
	mainBefore := guarded.Main
	walBefore := *guarded.WAL
	walBytesBefore, err := os.ReadFile(walBefore.Path)
	if err != nil {
		t.Fatalf("read WAL before cleanup: %v", err)
	}

	outsidePath := filepath.Join(canonicalReconcileTempDir(t), "source-archive-authoritative-sentinel")
	outsideBytes := []byte("must-never-be-touched")
	if err := os.WriteFile(outsidePath, outsideBytes, 0o600); err != nil {
		t.Fatalf("write outside sentinel: %v", err)
	}

	var removed []string
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			return checkpointResult{}, nil
		},
		remove: func(identity submissionfixture.Identity) error {
			removed = append(removed, identity.Path)
			if identity.Path == walBefore.Path {
				return fmt.Errorf("injected remove failure leaks %s and %s", identity.Path, outsidePath)
			}
			return submissionfixture.RemoveIfSame(identity)
		},
	}
	err = reconcileFixture(path, nil, owner, hooks)
	if !errors.Is(err, errReconcileCleanup) || err != errReconcileCleanup {
		t.Fatalf("reconcileFixture error = %v, want exact generic cleanup error", err)
	}
	for _, secret := range []string{path, outsidePath, "injected remove failure"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("cleanup error leaked sensitive detail %q: %q", secret, err)
		}
	}
	if len(removed) != 2 || removed[0] != guarded.SHM.Path || removed[1] != walBefore.Path {
		t.Fatalf("cleanup removals = %q, want guarded SHM then guarded WAL", removed)
	}
	if _, err := os.Lstat(guarded.SHM.Path); !os.IsNotExist(err) {
		t.Fatalf("first cleanup did not remove guarded SHM: %v", err)
	}
	if _, err := submissionfixture.Restat(mainBefore); err != nil {
		t.Fatalf("main identity changed after cleanup failure: %v", err)
	}
	if _, err := submissionfixture.Restat(walBefore); err != nil {
		t.Fatalf("remaining WAL identity changed after cleanup failure: %v", err)
	}
	walBytesAfter, err := os.ReadFile(walBefore.Path)
	if err != nil || !bytes.Equal(walBytesAfter, walBytesBefore) {
		t.Fatalf("remaining WAL bytes changed after cleanup failure: %q, %v", walBytesAfter, err)
	}
	outsideAfter, err := os.ReadFile(outsidePath)
	if err != nil || !bytes.Equal(outsideAfter, outsideBytes) {
		t.Fatalf("source/archive/authoritative sentinel changed: %q, %v", outsideAfter, err)
	}

	// Any failure after cleanup begins makes this disposable working copy
	// unusable and discard-required; partial sidecar removal is not recoverable.
}

func TestReconcileIdentitySwapFailsWithoutUnlinkingReplacement(t *testing.T) {
	path := makePlainReconcileSet(t)
	originalWAL := path + "-wal.original"
	replacement := []byte("replacement-wal-sentinel")
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			return checkpointResult{}, nil
		},
		afterClose: func() {
			if err := os.Rename(path+"-wal", originalWAL); err != nil {
				t.Fatalf("rename WAL: %v", err)
			}
			if err := os.WriteFile(path+"-wal", replacement, 0o600); err != nil {
				t.Fatalf("write replacement WAL: %v", err)
			}
		},
	}
	err := reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
	if err == nil {
		t.Fatal("expected inode-swap refusal")
	}
	if got, readErr := os.ReadFile(path + "-wal"); readErr != nil || !bytes.Equal(got, replacement) {
		t.Fatalf("replacement WAL changed: %q, %v", got, readErr)
	}
	if got, readErr := os.ReadFile(originalWAL); readErr != nil || string(got) != "wal-sentinel" {
		t.Fatalf("original WAL changed: %q, %v", got, readErr)
	}
	if got, readErr := os.ReadFile(path + "-shm"); readErr != nil || string(got) != "shm-sentinel" {
		t.Fatalf("SHM changed: %q, %v", got, readErr)
	}
}

func TestReconcilePreCleanupSwapFailsBeforeUnlinkingEitherSidecar(t *testing.T) {
	path := makePlainReconcileSet(t)
	originalWAL := path + "-wal.original"
	replacement := []byte{}
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			if err := os.Truncate(path+"-wal", 0); err != nil {
				t.Fatalf("truncate WAL: %v", err)
			}
			return checkpointResult{}, nil
		},
		beforeCleanup: func(submissionfixture.ReconcileSet) {
			if err := os.Rename(path+"-wal", originalWAL); err != nil {
				t.Fatalf("rename WAL: %v", err)
			}
			if err := os.WriteFile(path+"-wal", replacement, 0o600); err != nil {
				t.Fatalf("write replacement WAL: %v", err)
			}
		},
	}
	err := reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
	if err == nil {
		t.Fatal("expected pre-cleanup inode-swap refusal")
	}
	if _, statErr := os.Stat(path + "-shm"); statErr != nil {
		t.Fatalf("SHM was unlinked before WAL identity failure: %v", statErr)
	}
	if _, statErr := os.Stat(path + "-wal"); statErr != nil {
		t.Fatalf("replacement WAL was unlinked: %v", statErr)
	}
	if _, statErr := os.Stat(originalWAL); statErr != nil {
		t.Fatalf("original WAL was lost: %v", statErr)
	}
}

func TestReconcilePreCleanupMainSwapFailsBeforeUnlinkingSidecars(t *testing.T) {
	path := makePlainReconcileSet(t)
	originalMain := path + ".original"
	hooks := reconcileHooks{
		open: func(string) (*sql.DB, error) { return sql.Open("sqlite", ":memory:") },
		checkpoint: func(context.Context, *sql.DB) (checkpointResult, error) {
			if err := os.Truncate(path+"-wal", 0); err != nil {
				t.Fatalf("truncate WAL: %v", err)
			}
			return checkpointResult{}, nil
		},
		beforeCleanup: func(submissionfixture.ReconcileSet) {
			if err := os.Rename(path, originalMain); err != nil {
				t.Fatalf("rename main: %v", err)
			}
			if err := os.WriteFile(path, []byte("replacement-main"), 0o600); err != nil {
				t.Fatalf("write replacement main: %v", err)
			}
		},
	}
	err := reconcileFixture(path, nil, submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}, hooks)
	if err == nil {
		t.Fatal("expected pre-cleanup main-inode refusal")
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		if _, statErr := os.Stat(path + suffix); statErr != nil {
			t.Fatalf("sidecar %s was unlinked before main identity failure: %v", suffix, statErr)
		}
	}
}

func TestProductionReconcileMergesRealNonemptyWALThenImmutableEvidenceIncludesRow(t *testing.T) {
	root := canonicalReconcileTempDir(t)
	sourceDir := filepath.Join(root, "source")
	archiveDir := filepath.Join(root, "archive")
	workDir := filepath.Join(root, "work")
	for _, directory := range []string{sourceDir, archiveDir, workDir} {
		if err := os.Mkdir(directory, 0o700); err != nil {
			t.Fatalf("Mkdir %s: %v", directory, err)
		}
	}
	sourcePath := filepath.Join(sourceDir, "source.db")
	sourceDB, err := sql.Open("sqlite", sourcePath)
	if err != nil {
		t.Fatalf("open source: %v", err)
	}
	defer sourceDB.Close()
	sourceDB.SetMaxOpenConns(1)
	mustReconcileExec(t, sourceDB, `PRAGMA journal_mode=WAL`)
	mustReconcileExec(t, sourceDB, `PRAGMA wal_autocheckpoint=0`)
	mustReconcileExec(t, sourceDB, reconcileTableSQL)
	var busy, logFrames, checkpointed int
	if err := sourceDB.QueryRow(`PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&busy, &logFrames, &checkpointed); err != nil {
		t.Fatalf("checkpoint source base: %v", err)
	}
	if busy != 0 || logFrames != 0 || checkpointed != 0 {
		t.Fatalf("source base checkpoint = %d/%d/%d", busy, logFrames, checkpointed)
	}
	mustReconcileExec(t, sourceDB, `INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status, rejection_reason
	) VALUES (41, '2026-07-13T00:00:00Z', '2026-07-13', '5+4=9', '9', NULL, 'hard', 1, 'web', NULL, 'accepted', NULL)`)
	walInfo, err := os.Stat(sourcePath + "-wal")
	if err != nil || walInfo.Size() == 0 {
		t.Fatalf("source WAL not nonempty: %#v, %v", walInfo, err)
	}
	shmInfo, err := os.Stat(sourcePath + "-shm")
	if err != nil || shmInfo.Size() == 0 {
		t.Fatalf("source SHM not nonempty: %#v, %v", shmInfo, err)
	}

	archivePath := filepath.Join(archiveDir, "archive.db")
	workPath := filepath.Join(workDir, "work.db")
	for _, destination := range []string{archivePath, workPath} {
		copyReconcileSet(t, sourcePath, destination)
	}
	entrypointPath := ""
	if os.Geteuid() != 0 {
		entrypointDir := filepath.Join(root, "entrypoint")
		if err := os.Mkdir(entrypointDir, 0o700); err != nil {
			t.Fatalf("Mkdir entrypoint: %v", err)
		}
		entrypointPath = filepath.Join(entrypointDir, "entrypoint.db")
		copyReconcileSet(t, sourcePath, entrypointPath)
	}
	sourceBefore := snapshotReconcileSet(t, sourcePath)
	archiveBefore := snapshotReconcileSet(t, archivePath)
	if _, err := submissionfixture.GuardAudit(workPath, nil); err == nil {
		t.Fatal("unreconciled WAL copy unexpectedly passed the audit guard")
	}

	observedNonemptySHMAfterTruncate := false
	hooks := reconcileHooks{afterCheckpoint: func(guarded submissionfixture.ReconcileSet) {
		info, statErr := os.Stat(guarded.SHM.Path)
		if statErr != nil {
			t.Fatalf("stat immediate post-TRUNCATE SHM: %v", statErr)
		}
		if info.Size() == 0 {
			t.Fatal("immediate post-TRUNCATE SHM was empty; want normal nonzero transient state")
		}
		observedNonemptySHMAfterTruncate = true
	}}
	owner := submissionfixture.Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}
	if err := reconcileFixture(workPath, nil, owner, hooks); err != nil {
		t.Fatalf("reconcileFixture production path: %v", err)
	}
	if !observedNonemptySHMAfterTruncate {
		t.Fatal("did not observe nonempty SHM after successful TRUNCATE")
	}
	if entrypointPath != "" {
		if err := runReconcile([]string{"--confirm-disposable-copy", entrypointPath}, nil, uint32(os.Geteuid()), uint32(os.Getegid())); err != nil {
			t.Fatalf("runReconcile exact nonzero-UID entrypoint: %v", err)
		}
	}
	assertReconcileSetUnchanged(t, sourcePath, sourceBefore)
	assertReconcileSetUnchanged(t, archivePath, archiveBefore)
	if _, err := os.Lstat(workPath + "-wal"); !os.IsNotExist(err) {
		t.Fatalf("reconciled WAL remains: %v", err)
	}
	if _, err := os.Lstat(workPath + "-shm"); !os.IsNotExist(err) {
		t.Fatalf("reconciled SHM remains: %v", err)
	}
	if entrypointPath != "" {
		for _, suffix := range []string{"-wal", "-shm"} {
			if _, err := os.Lstat(entrypointPath + suffix); !os.IsNotExist(err) {
				t.Fatalf("entrypoint reconciled sidecar %s remains: %v", suffix, err)
			}
		}
	}
	if err := os.Chmod(workPath, 0o400); err != nil {
		t.Fatalf("Chmod audit copy: %v", err)
	}
	if _, err := submissionfixture.GuardAudit(workPath, nil); err != nil {
		t.Fatalf("audit guard after reconciliation: %v", err)
	}
	auditDB, err := sql.Open("sqlite", submissionfixture.ReadOnlyURI(workPath))
	if err != nil {
		t.Fatalf("open immutable reconciled copy: %v", err)
	}
	defer auditDB.Close()
	evidence, err := submissionevidence.Capture(context.Background(), auditDB)
	if err != nil {
		t.Fatalf("capture reconciled evidence: %v", err)
	}
	if evidence.Count != 1 {
		t.Fatalf("reconciled count = %d, want WAL-only row count 1", evidence.Count)
	}
}

func TestReconcileErrorsRedactPathsURIsRowsAndEnvironment(t *testing.T) {
	path := filepath.Join(canonicalReconcileTempDir(t), "secret-reconcile-path?mode=ro.db")
	if err := os.WriteFile(path, []byte("secret-row-value"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := os.WriteFile(path+"-wal", []byte("wal"), 0o600); err != nil {
		t.Fatalf("WriteFile WAL: %v", err)
	}
	if err := os.WriteFile(path+"-shm", []byte("shm"), 0o600); err != nil {
		t.Fatalf("WriteFile SHM: %v", err)
	}
	t.Setenv("SECRET_RECONCILE_ENV", "secret-environment-value")
	err := runReconcile([]string{"--confirm-disposable-copy", path}, nil, uint32(os.Geteuid()), uint32(os.Getegid()))
	if err == nil {
		t.Fatal("expected invalid-database failure")
	}
	for _, forbidden := range []string{path, submissionfixture.ReadWriteURI(path), "secret-reconcile-path", "secret-row-value", "secret-environment-value"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("diagnostic %q leaked %q", err, forbidden)
		}
	}
}

func makePlainReconcileSet(t *testing.T) string {
	t.Helper()
	path := filepath.Join(canonicalReconcileTempDir(t), "copy.db")
	for suffix, content := range map[string]string{"": "main-sentinel", "-wal": "wal-sentinel", "-shm": "shm-sentinel"} {
		if err := os.WriteFile(path+suffix, []byte(content), 0o600); err != nil {
			t.Fatalf("WriteFile %s: %v", suffix, err)
		}
	}
	return path
}

func canonicalReconcileTempDir(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	return root
}

func createReconcileURI(path string) string {
	return (&url.URL{Scheme: "file", Path: path, RawQuery: url.Values{"mode": {"rwc"}}.Encode()}).String()
}

func snapshotReconcileSet(t *testing.T, path string) map[string][sha256.Size]byte {
	t.Helper()
	result := make(map[string][sha256.Size]byte)
	for _, suffix := range []string{"", "-wal", "-shm"} {
		content, err := os.ReadFile(path + suffix)
		if err != nil {
			t.Fatalf("ReadFile %s: %v", suffix, err)
		}
		result[suffix] = sha256.Sum256(content)
	}
	return result
}

func assertReconcileSetUnchanged(t *testing.T, path string, before map[string][sha256.Size]byte) {
	t.Helper()
	for suffix, want := range before {
		content, err := os.ReadFile(path + suffix)
		if err != nil {
			t.Fatalf("ReadFile %s after: %v", suffix, err)
		}
		if got := sha256.Sum256(content); got != want {
			t.Fatalf("%s bytes changed: %x, want %x", suffix, got, want)
		}
	}
}

func copyReconcileSet(t *testing.T, source, destination string) {
	t.Helper()
	for _, suffix := range []string{"", "-wal", "-shm"} {
		content, err := os.ReadFile(source + suffix)
		if err != nil {
			t.Fatalf("ReadFile source %s: %v", suffix, err)
		}
		if err := os.WriteFile(destination+suffix, content, 0o600); err != nil {
			t.Fatalf("WriteFile destination %s: %v", suffix, err)
		}
	}
}

func mustReconcileExec(t *testing.T, db *sql.DB, statement string) {
	t.Helper()
	if _, err := db.Exec(statement); err != nil {
		t.Fatalf("Exec: %v\n%s", err, statement)
	}
}

func TestCheckpointResultFormattingDoesNotExposeData(t *testing.T) {
	result := checkpointResult{Busy: 0, Log: 0, Checkpointed: 0}
	if got := fmt.Sprintf("%d/%d/%d", result.Busy, result.Log, result.Checkpointed); got != "0/0/0" {
		t.Fatalf("unexpected checkpoint tuple %q", got)
	}
}
