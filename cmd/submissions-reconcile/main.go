package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"crackledate-web/internal/submissionfixture"
	_ "modernc.org/sqlite"
)

var (
	errReconcileInvocation = errors.New("submissions reconciliation requires the exact disposable-copy confirmation and one eligible SQLite fixture")
	errReconcileGuard      = errors.New("submissions reconciliation fixture checks failed")
	errReconcileOpen       = errors.New("submissions reconciliation could not open the copied fixture")
	errReconcileCheckpoint = errors.New("submissions reconciliation checkpoint did not complete exactly")
	errReconcileIdentity   = errors.New("submissions reconciliation fixture identity changed")
	errReconcileCleanup    = errors.New("submissions reconciliation cleanup failed; discard and recreate the disposable working copy")
)

type checkpointResult struct {
	Busy         int
	Log          int
	Checkpointed int
}

type reconcileHooks struct {
	open            func(string) (*sql.DB, error)
	checkpoint      func(context.Context, *sql.DB) (checkpointResult, error)
	afterCheckpoint func(submissionfixture.ReconcileSet)
	afterClose      func()
	beforeCleanup   func(submissionfixture.ReconcileSet)
	remove          func(submissionfixture.Identity) error
}

func main() {
	if err := runReconcile(
		os.Args[1:],
		defaultKnownSubmissionPaths(),
		uint32(os.Geteuid()),
		uint32(os.Getegid()),
	); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runReconcile(args []string, knownPaths []string, uid, gid uint32) error {
	if len(args) != 2 || args[0] != "--confirm-disposable-copy" || uid == 0 || gid == 0 {
		return errReconcileInvocation
	}
	return reconcileFixture(
		args[1],
		knownPaths,
		submissionfixture.Owner{UID: uid, GID: gid},
		reconcileHooks{},
	)
}

func reconcileFixture(path string, knownPaths []string, owner submissionfixture.Owner, hooks reconcileHooks) error {
	guarded, err := submissionfixture.GuardReconcile(path, knownPaths, owner)
	if err != nil || guarded.WAL == nil || guarded.SHM == nil {
		return errReconcileGuard
	}

	open := hooks.open
	if open == nil {
		open = openReconcileDatabase
	}
	db, err := open(guarded.Main.Path)
	if err != nil {
		return errReconcileOpen
	}
	checkpoint := hooks.checkpoint
	if checkpoint == nil {
		checkpoint = checkpointWAL
	}
	result, checkpointErr := checkpoint(context.Background(), db)
	if checkpointErr == nil && result == (checkpointResult{}) && hooks.afterCheckpoint != nil {
		hooks.afterCheckpoint(guarded)
	}
	closeErr := db.Close()
	if hooks.afterClose != nil {
		hooks.afterClose()
	}
	if checkpointErr != nil || closeErr != nil || result != (checkpointResult{}) {
		return errReconcileCheckpoint
	}

	if _, err := submissionfixture.Restat(guarded.Main); err != nil {
		return errReconcileIdentity
	}
	walPresent, walAfter, err := restatIfPresent(*guarded.WAL)
	if err != nil || (walPresent && walAfter.Size != 0) {
		return errReconcileIdentity
	}
	shmPresent, _, err := restatIfPresent(*guarded.SHM)
	if err != nil {
		return errReconcileIdentity
	}

	if hooks.beforeCleanup != nil {
		hooks.beforeCleanup(guarded)
	}
	if _, err := submissionfixture.Restat(guarded.Main); err != nil {
		return errReconcileIdentity
	}
	if shmPresent {
		if _, err := submissionfixture.Restat(*guarded.SHM); err != nil {
			return errReconcileIdentity
		}
	}
	if walPresent {
		walBeforeRemoval, err := submissionfixture.Restat(*guarded.WAL)
		if err != nil || walBeforeRemoval.Size != 0 {
			return errReconcileIdentity
		}
	}
	remove := hooks.remove
	if remove == nil {
		remove = submissionfixture.RemoveIfSame
	}
	if shmPresent {
		if err := remove(*guarded.SHM); err != nil {
			return errReconcileCleanup
		}
	}
	if walPresent {
		if err := remove(*guarded.WAL); err != nil {
			return errReconcileCleanup
		}
	}
	return nil
}

func openReconcileDatabase(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", submissionfixture.ReadWriteURI(path))
	if err != nil {
		return nil, errReconcileOpen
	}
	db.SetMaxOpenConns(1)
	if err := db.PingContext(context.Background()); err != nil {
		db.Close()
		return nil, errReconcileOpen
	}
	return db, nil
}

func checkpointWAL(ctx context.Context, db *sql.DB) (checkpointResult, error) {
	var result checkpointResult
	err := db.QueryRowContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&result.Busy, &result.Log, &result.Checkpointed)
	if err != nil {
		return checkpointResult{}, errReconcileCheckpoint
	}
	return result, nil
}

func restatIfPresent(before submissionfixture.Identity) (bool, submissionfixture.Identity, error) {
	if _, err := os.Lstat(before.Path); err != nil {
		if os.IsNotExist(err) {
			return false, submissionfixture.Identity{}, nil
		}
		return false, submissionfixture.Identity{}, errReconcileIdentity
	}
	after, err := submissionfixture.Restat(before)
	if err != nil {
		return false, submissionfixture.Identity{}, errReconcileIdentity
	}
	return true, after, nil
}

func defaultKnownSubmissionPaths() []string {
	paths := []string{"/data/submissions.db"}
	workingDirectory, err := os.Getwd()
	if err != nil {
		return paths
	}
	for directory := workingDirectory; ; directory = filepath.Dir(directory) {
		if info, statErr := os.Stat(filepath.Join(directory, "go.mod")); statErr == nil && info.Mode().IsRegular() {
			paths = append(paths, filepath.Join(directory, "data", "submissions.db"))
			break
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
	}
	return paths
}
