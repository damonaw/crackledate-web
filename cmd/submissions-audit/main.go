package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"crackledate-web/internal/submissionevidence"
	"crackledate-web/internal/submissionfixture"
	_ "modernc.org/sqlite"
)

var (
	errAuditInvocation = errors.New("submissions audit requires one eligible copied SQLite fixture")
	errAuditOpen       = errors.New("submissions audit could not open the copied fixture")
	errAuditSchema     = errors.New("submissions audit found an unsupported submission schema")
	errAuditIntegrity  = errors.New("submissions audit integrity checks failed")
	errAuditEvidence   = errors.New("submissions audit could not capture canonical evidence")
	errAuditIdentity   = errors.New("submissions audit fixture identity changed")
)

type auditColumn struct {
	Name       string
	Type       string
	NotNull    int
	PrimaryKey int
}

var currentAuditColumns = []auditColumn{
	{Name: "id", Type: "INTEGER", PrimaryKey: 1},
	{Name: "submitted_at", Type: "TEXT", NotNull: 1},
	{Name: "puzzle_date", Type: "TEXT", NotNull: 1},
	{Name: "equation", Type: "TEXT", NotNull: 1},
	{Name: "value", Type: "TEXT", NotNull: 1},
	{Name: "solve_time_seconds", Type: "INTEGER"},
	{Name: "difficulty", Type: "TEXT", NotNull: 1},
	{Name: "hard_mode", Type: "INTEGER", NotNull: 1},
	{Name: "platform", Type: "TEXT", NotNull: 1},
	{Name: "app_version", Type: "TEXT"},
	{Name: "submission_status", Type: "TEXT", NotNull: 1},
	{Name: "rejection_reason", Type: "TEXT"},
}

func main() {
	if err := runAudit(os.Args[1:], os.Stdout, defaultKnownSubmissionPaths()); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runAudit(args []string, stdout io.Writer, knownPaths []string) error {
	if len(args) != 1 || stdout == nil {
		return errAuditInvocation
	}
	identity, err := submissionfixture.GuardAudit(args[0], knownPaths)
	if err != nil {
		return errAuditInvocation
	}
	db, err := openAuditDatabase(identity.Path)
	if err != nil {
		return errAuditOpen
	}
	defer db.Close()

	ctx := context.Background()
	if err := validateAuditSchema(ctx, db); err != nil {
		return errAuditSchema
	}
	if err := validateAuditIntegrity(ctx, db); err != nil {
		return errAuditIntegrity
	}
	evidence, err := submissionevidence.Capture(ctx, db)
	if err != nil {
		return errAuditEvidence
	}
	if _, err := submissionfixture.Restat(identity); err != nil {
		return errAuditIdentity
	}
	if _, err := fmt.Fprintf(stdout, "submission_count=%d\nsubmission_sha256=%x\n", evidence.Count, evidence.Digest); err != nil {
		return errAuditEvidence
	}
	return nil
}

func openAuditDatabase(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", submissionfixture.ReadOnlyURI(path))
	if err != nil {
		return nil, errAuditOpen
	}
	db.SetMaxOpenConns(1)
	if err := db.PingContext(context.Background()); err != nil {
		db.Close()
		return nil, errAuditOpen
	}
	return db, nil
}

func validateAuditSchema(ctx context.Context, db *sql.DB) error {
	var objectType string
	var definition sql.NullString
	err := db.QueryRowContext(ctx, `SELECT type, sql FROM sqlite_schema WHERE name = 'submission_attempts'`).Scan(&objectType, &definition)
	if err != nil || objectType != "table" || !definition.Valid {
		return errAuditSchema
	}
	normalizedDefinition := strings.ToLower(strings.TrimSpace(definition.String))
	if !strings.HasPrefix(normalizedDefinition, "create table") || strings.HasPrefix(normalizedDefinition, "create virtual table") {
		return errAuditSchema
	}

	rows, err := db.QueryContext(ctx, `PRAGMA table_xinfo('submission_attempts')`)
	if err != nil {
		return errAuditSchema
	}
	defer rows.Close()
	var columns []auditColumn
	for rows.Next() {
		var cid, notNull, primaryKey, hidden int
		var name, columnType string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey, &hidden); err != nil {
			return errAuditSchema
		}
		if cid != len(columns) || hidden != 0 || defaultValue.Valid {
			return errAuditSchema
		}
		columns = append(columns, auditColumn{Name: name, Type: columnType, NotNull: notNull, PrimaryKey: primaryKey})
	}
	if err := rows.Err(); err != nil {
		return errAuditSchema
	}
	if !supportedAuditColumns(columns) {
		return errAuditSchema
	}

	indexRows, err := db.QueryContext(ctx, `PRAGMA index_list('submission_attempts')`)
	if err != nil {
		return errAuditSchema
	}
	defer indexRows.Close()
	for indexRows.Next() {
		var sequence, unique, partial int
		var name, origin string
		if err := indexRows.Scan(&sequence, &name, &unique, &origin, &partial); err != nil {
			return errAuditSchema
		}
		if origin == "pk" {
			return errAuditSchema
		}
	}
	if err := indexRows.Err(); err != nil {
		return errAuditSchema
	}

	var invalidIDs int64
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM submission_attempts WHERE id IS NULL OR id != rowid`).Scan(&invalidIDs); err != nil || invalidIDs != 0 {
		return errAuditSchema
	}
	return nil
}

func supportedAuditColumns(columns []auditColumn) bool {
	if len(columns) != len(currentAuditColumns) && len(columns) != len(currentAuditColumns)+1 {
		return false
	}
	for index, expected := range currentAuditColumns {
		if columns[index] != expected {
			return false
		}
	}
	if len(columns) == len(currentAuditColumns)+1 {
		expected := auditColumn{Name: "user_id", Type: "INTEGER"}
		if columns[len(columns)-1] != expected {
			return false
		}
	}
	return true
}

func validateAuditIntegrity(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `PRAGMA quick_check`)
	if err != nil {
		return errAuditIntegrity
	}
	var results []string
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			rows.Close()
			return errAuditIntegrity
		}
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return errAuditIntegrity
	}
	if err := rows.Close(); err != nil || !exactQuickCheck(results) {
		return errAuditIntegrity
	}

	foreignKeys, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return errAuditIntegrity
	}
	defer foreignKeys.Close()
	if foreignKeys.Next() || foreignKeys.Err() != nil {
		return errAuditIntegrity
	}
	return nil
}

func exactQuickCheck(results []string) bool {
	return len(results) == 1 && results[0] == "ok"
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
