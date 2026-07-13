package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
	"unicode"
)

const historicalSubmissionTableSQL = `
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

const historicalSubmissionIndexesSQL = `
	CREATE INDEX IF NOT EXISTS submission_attempts_submitted_at_idx ON submission_attempts (submitted_at);
	CREATE INDEX IF NOT EXISTS submission_attempts_puzzle_status_idx ON submission_attempts (puzzle_date, submission_status);
	CREATE INDEX IF NOT EXISTS submission_attempts_user_id_idx ON submission_attempts (user_id);
`

var historicalAccountSchemaSQL = []string{
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

var retainedSubmissionColumns = []string{
	"id",
	"submitted_at",
	"puzzle_date",
	"equation",
	"value",
	"solve_time_seconds",
	"difficulty",
	"hard_mode",
	"platform",
	"app_version",
	"submission_status",
	"rejection_reason",
}

type legacyRetirementOptions struct {
	afterFinalPreflight func() error
	afterDestructiveDDL func() error
}

type legacySQLRunner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type legacySchemaObject struct {
	objectType string
	table      string
	sql        sql.NullString
}

type legacyColumnFingerprint struct {
	position     int
	name         string
	columnType   string
	notNull      int
	defaultValue sql.NullString
	primaryKey   int
	hidden       int
}

type legacyForeignKeyFingerprint struct {
	id       int
	sequence int
	table    string
	from     string
	to       string
	onUpdate string
	onDelete string
	match    string
}

type legacyIndexColumnFingerprint struct {
	sequence int
	columnID int
	name     sql.NullString
	desc     int
	collate  sql.NullString
	key      int
}

type legacyIndexFingerprint struct {
	unique  int
	origin  string
	partial int
	sql     sql.NullString
	columns []legacyIndexColumnFingerprint
}

type legacySchemaFingerprint struct {
	objects     map[string]legacySchemaObject
	columns     map[string][]legacyColumnFingerprint
	foreignKeys map[string][]legacyForeignKeyFingerprint
	indexes     map[string]map[string]legacyIndexFingerprint
	sequences   map[string]int64
}

type retainedSubmissionEvidence struct {
	count  int64
	digest [sha256.Size]byte
}

type legacyDatabaseShape int

const (
	legacyDatabaseEmpty legacyDatabaseShape = iota
	legacyDatabaseCurrent
	legacyDatabaseHistorical
)

func retireLegacyAccountData(db *sql.DB, options legacyRetirementOptions) error {
	if db == nil {
		return fmt.Errorf("retire legacy account data: database is not configured")
	}
	currentReference, err := buildLegacySchemaReference(false)
	if err != nil {
		return fmt.Errorf("build current schema reference: %w", err)
	}
	historicalReference, err := buildLegacySchemaReference(true)
	if err != nil {
		return fmt.Errorf("build historical schema reference: %w", err)
	}

	ctx := context.Background()
	connection, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire retirement connection: %w", err)
	}
	defer connection.Close()
	if _, err := connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("begin legacy retirement: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	before, shape, err := inspectLegacySchema(ctx, connection, currentReference, historicalReference)
	if err != nil {
		return err
	}
	if shape == legacyDatabaseEmpty || shape == legacyDatabaseCurrent {
		return nil
	}

	linkedSolutions, err := countRows(ctx, connection, `SELECT count(*) FROM user_solutions`)
	if err != nil {
		return fmt.Errorf("preflight user_solutions count: %w", err)
	}
	if linkedSolutions != 0 {
		return fmt.Errorf("legacy retirement refused: user_solutions contains %d linked rows", linkedSolutions)
	}
	linkedSubmissions, err := countRows(ctx, connection, `SELECT count(*) FROM submission_attempts WHERE user_id IS NOT NULL`)
	if err != nil {
		return fmt.Errorf("preflight submission_attempts links: %w", err)
	}
	if linkedSubmissions != 0 {
		return fmt.Errorf("legacy retirement refused: submission_attempts.user_id contains %d linked rows", linkedSubmissions)
	}

	retainedBefore, err := captureRetainedSubmissionEvidence(ctx, connection)
	if err != nil {
		return fmt.Errorf("capture retained submissions: %w", err)
	}
	if options.afterFinalPreflight != nil {
		if err := options.afterFinalPreflight(); err != nil {
			return err
		}
	}

	statements := []string{
		`DROP TABLE user_solutions`,
		`DROP TABLE user_preferences`,
		`DROP TABLE email_verifications`,
		`DROP TABLE sessions`,
		`DROP TABLE users`,
		`DROP INDEX submission_attempts_user_id_idx`,
		`ALTER TABLE submission_attempts DROP COLUMN user_id`,
	}
	for _, statement := range statements {
		if _, err := connection.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("retire legacy schema with %q: %w", statement, err)
		}
	}
	if options.afterDestructiveDDL != nil {
		if err := options.afterDestructiveDDL(); err != nil {
			return err
		}
	}

	after, afterShape, err := inspectLegacySchema(ctx, connection, currentReference, historicalReference)
	if err != nil {
		return fmt.Errorf("verify retired schema: %w", err)
	}
	if afterShape != legacyDatabaseCurrent {
		return fmt.Errorf("verify retired schema: expected current submission schema")
	}
	retainedAfter, err := captureRetainedSubmissionEvidence(ctx, connection)
	if err != nil {
		return fmt.Errorf("verify retained submissions: %w", err)
	}
	if retainedBefore != retainedAfter {
		return fmt.Errorf("verify retained submissions: count or digest changed")
	}
	if err := verifyUnchangedRetainedObjects(before, after); err != nil {
		return err
	}
	if err := verifyRetainedSequence(before.sequences, after.sequences); err != nil {
		return err
	}
	if err := verifySQLiteIntegrity(ctx, connection); err != nil {
		return err
	}
	if _, err := connection.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("commit legacy retirement: %w", err)
	}
	committed = true
	return nil
}

func inspectLegacySchema(
	ctx context.Context,
	runner legacySQLRunner,
	currentReference legacySchemaFingerprint,
	historicalReference legacySchemaFingerprint,
) (legacySchemaFingerprint, legacyDatabaseShape, error) {
	objects, err := captureLegacySchemaObjects(ctx, runner)
	if err != nil {
		return legacySchemaFingerprint{}, 0, fmt.Errorf("inspect sqlite_schema: %w", err)
	}
	if len(objects) == 0 {
		return legacySchemaFingerprint{objects: objects}, legacyDatabaseEmpty, nil
	}

	reference := currentReference
	shape := legacyDatabaseCurrent
	if schemaKeySetsEqual(objects, historicalReference.objects) {
		reference = historicalReference
		shape = legacyDatabaseHistorical
	} else if !schemaKeySetsEqual(objects, currentReference.objects) {
		if hasHistoricalSchemaIndicator(objects) {
			reference = historicalReference
		}
		return legacySchemaFingerprint{}, 0, unsupportedLegacyObjectSet(objects, reference.objects)
	}

	fingerprint, err := captureLegacySchemaFingerprint(ctx, runner, objects)
	if err != nil {
		return legacySchemaFingerprint{}, 0, fmt.Errorf("capture legacy schema fingerprint: %w", err)
	}
	if err := compareLegacySchemaFingerprint(fingerprint, reference); err != nil {
		return legacySchemaFingerprint{}, 0, err
	}
	allowedSequences := map[string]bool{"submission_attempts": true}
	if shape == legacyDatabaseHistorical {
		for _, name := range []string{"users", "sessions", "email_verifications", "user_solutions"} {
			allowedSequences[name] = true
		}
	}
	for name := range fingerprint.sequences {
		if !allowedSequences[name] {
			return legacySchemaFingerprint{}, 0, unsupportedLegacyVariant("sqlite_sequence row "+name, "is not allowlisted")
		}
	}
	return fingerprint, shape, nil
}

func buildLegacySchemaReference(historical bool) (legacySchemaFingerprint, error) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return legacySchemaFingerprint{}, err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx := context.Background()
	statements := []string{currentSubmissionTableSQL, currentSubmissionIndexesSQL}
	if historical {
		statements = []string{historicalSubmissionTableSQL, historicalSubmissionIndexesSQL}
		statements = append(statements, historicalAccountSchemaSQL...)
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return legacySchemaFingerprint{}, err
		}
	}
	objects, err := captureLegacySchemaObjects(ctx, db)
	if err != nil {
		return legacySchemaFingerprint{}, err
	}
	return captureLegacySchemaFingerprint(ctx, db, objects)
}

func captureLegacySchemaObjects(ctx context.Context, runner legacySQLRunner) (map[string]legacySchemaObject, error) {
	rows, err := runner.QueryContext(ctx, `SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	objects := make(map[string]legacySchemaObject)
	for rows.Next() {
		var objectType, name, table string
		var sqlText sql.NullString
		if err := rows.Scan(&objectType, &name, &table, &sqlText); err != nil {
			return nil, err
		}
		objects[schemaObjectKey(objectType, name)] = legacySchemaObject{objectType: objectType, table: table, sql: sqlText}
	}
	return objects, rows.Err()
}

func captureLegacySchemaFingerprint(
	ctx context.Context,
	runner legacySQLRunner,
	objects map[string]legacySchemaObject,
) (legacySchemaFingerprint, error) {
	fingerprint := legacySchemaFingerprint{
		objects:     objects,
		columns:     make(map[string][]legacyColumnFingerprint),
		foreignKeys: make(map[string][]legacyForeignKeyFingerprint),
		indexes:     make(map[string]map[string]legacyIndexFingerprint),
		sequences:   make(map[string]int64),
	}
	var tables []string
	for key, object := range objects {
		if object.objectType == "table" {
			tables = append(tables, strings.SplitN(key, "\x00", 2)[1])
		}
	}
	sort.Strings(tables)
	for _, table := range tables {
		columns, err := captureLegacyColumns(ctx, runner, table)
		if err != nil {
			return legacySchemaFingerprint{}, err
		}
		fingerprint.columns[table] = columns
		foreignKeys, err := captureLegacyForeignKeys(ctx, runner, table)
		if err != nil {
			return legacySchemaFingerprint{}, err
		}
		fingerprint.foreignKeys[table] = foreignKeys
		indexes, err := captureLegacyIndexes(ctx, runner, table, objects)
		if err != nil {
			return legacySchemaFingerprint{}, err
		}
		fingerprint.indexes[table] = indexes
	}
	if _, ok := objects[schemaObjectKey("table", "sqlite_sequence")]; ok {
		rows, err := runner.QueryContext(ctx, `SELECT typeof(name), name, typeof(seq), seq FROM sqlite_sequence ORDER BY name, seq`)
		if err != nil {
			return legacySchemaFingerprint{}, err
		}
		for rows.Next() {
			var nameStorageClass, sequenceStorageClass string
			var rawName, rawSequence any
			if err := rows.Scan(&nameStorageClass, &rawName, &sequenceStorageClass, &rawSequence); err != nil {
				rows.Close()
				return legacySchemaFingerprint{}, err
			}
			name, nameOK := rawName.(string)
			sequence, sequenceOK := rawSequence.(int64)
			if nameStorageClass != "text" || !nameOK || sequenceStorageClass != "integer" || !sequenceOK {
				rows.Close()
				return legacySchemaFingerprint{}, unsupportedLegacyVariant("sqlite_sequence row", "name and sequence must use canonical text/integer storage")
			}
			if _, exists := fingerprint.sequences[name]; exists {
				rows.Close()
				return legacySchemaFingerprint{}, unsupportedLegacyVariant("duplicate sqlite_sequence row "+name, "sequence names must be unique")
			}
			fingerprint.sequences[name] = sequence
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return legacySchemaFingerprint{}, err
		}
		if err := rows.Close(); err != nil {
			return legacySchemaFingerprint{}, err
		}
	}
	return fingerprint, nil
}

func captureLegacyColumns(ctx context.Context, runner legacySQLRunner, table string) ([]legacyColumnFingerprint, error) {
	rows, err := runner.QueryContext(ctx, `SELECT cid, name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []legacyColumnFingerprint
	for rows.Next() {
		var item legacyColumnFingerprint
		if err := rows.Scan(&item.position, &item.name, &item.columnType, &item.notNull, &item.defaultValue, &item.primaryKey, &item.hidden); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func captureLegacyForeignKeys(ctx context.Context, runner legacySQLRunner, table string) ([]legacyForeignKeyFingerprint, error) {
	rows, err := runner.QueryContext(ctx, `SELECT id, seq, "table", "from", "to", on_update, on_delete, match FROM pragma_foreign_key_list(?) ORDER BY id, seq`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []legacyForeignKeyFingerprint
	for rows.Next() {
		var item legacyForeignKeyFingerprint
		if err := rows.Scan(&item.id, &item.sequence, &item.table, &item.from, &item.to, &item.onUpdate, &item.onDelete, &item.match); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func captureLegacyIndexes(
	ctx context.Context,
	runner legacySQLRunner,
	table string,
	objects map[string]legacySchemaObject,
) (map[string]legacyIndexFingerprint, error) {
	rows, err := runner.QueryContext(ctx, `SELECT name, "unique", origin, partial FROM pragma_index_list(?) ORDER BY name`, table)
	if err != nil {
		return nil, err
	}
	type listedIndex struct {
		name        string
		fingerprint legacyIndexFingerprint
	}
	var listed []listedIndex
	for rows.Next() {
		var name string
		var item legacyIndexFingerprint
		if err := rows.Scan(&name, &item.unique, &item.origin, &item.partial); err != nil {
			rows.Close()
			return nil, err
		}
		listed = append(listed, listedIndex{name: name, fingerprint: item})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	result := make(map[string]legacyIndexFingerprint)
	for _, listedItem := range listed {
		name := listedItem.name
		item := listedItem.fingerprint
		if object, ok := objects[schemaObjectKey("index", name)]; ok {
			item.sql = object.sql
		}
		columns, err := runner.QueryContext(ctx, `SELECT seqno, cid, name, desc, coll, key FROM pragma_index_xinfo(?) ORDER BY seqno`, name)
		if err != nil {
			return nil, err
		}
		for columns.Next() {
			var column legacyIndexColumnFingerprint
			if err := columns.Scan(&column.sequence, &column.columnID, &column.name, &column.desc, &column.collate, &column.key); err != nil {
				columns.Close()
				return nil, err
			}
			item.columns = append(item.columns, column)
		}
		if err := columns.Err(); err != nil {
			columns.Close()
			return nil, err
		}
		if err := columns.Close(); err != nil {
			return nil, err
		}
		result[name] = item
	}
	return result, nil
}

func compareLegacySchemaFingerprint(actual, expected legacySchemaFingerprint) error {
	for key, expectedObject := range expected.objects {
		actualObject := actual.objects[key]
		name := strings.SplitN(key, "\x00", 2)[1]
		if name == "submission_attempts" && expectedObject.objectType == "table" {
			if !actualObject.sql.Valid || !expectedObject.sql.Valid || compactSchemaSQL(actualObject.sql.String) != compactSchemaSQL(expectedObject.sql.String) {
				return unsupportedLegacyVariant(name, "table SQL does not match a supported construction path")
			}
			continue
		}
		if actualObject != expectedObject {
			return unsupportedLegacyVariant(name, "sqlite_schema SQL does not match the historical definition")
		}
	}
	for table, expectedColumns := range expected.columns {
		if !reflect.DeepEqual(actual.columns[table], expectedColumns) {
			return unsupportedLegacyVariant(table, "table_xinfo does not match")
		}
		if !reflect.DeepEqual(actual.foreignKeys[table], expected.foreignKeys[table]) {
			return unsupportedLegacyVariant(table, "foreign keys do not match")
		}
		if !reflect.DeepEqual(actual.indexes[table], expected.indexes[table]) {
			return unsupportedLegacyVariant(table, "index semantics do not match")
		}
	}
	return nil
}

func captureRetainedSubmissionEvidence(ctx context.Context, runner legacySQLRunner) (retainedSubmissionEvidence, error) {
	query := `SELECT ` + strings.Join(retainedSubmissionColumns, ", ") + ` FROM submission_attempts ORDER BY id`
	rows, err := runner.QueryContext(ctx, query)
	if err != nil {
		return retainedSubmissionEvidence{}, err
	}
	defer rows.Close()
	hasher := sha256.New()
	var count int64
	for rows.Next() {
		values := make([]any, len(retainedSubmissionColumns))
		destinations := make([]any, len(values))
		for index := range values {
			destinations[index] = &values[index]
		}
		if err := rows.Scan(destinations...); err != nil {
			return retainedSubmissionEvidence{}, err
		}
		for _, value := range values {
			if err := encodeSQLiteValue(hasher, value); err != nil {
				return retainedSubmissionEvidence{}, err
			}
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return retainedSubmissionEvidence{}, err
	}
	var digest [sha256.Size]byte
	copy(digest[:], hasher.Sum(nil))
	return retainedSubmissionEvidence{count: count, digest: digest}, nil
}

type legacyHashWriter interface {
	Write([]byte) (int, error)
}

func encodeSQLiteValue(writer legacyHashWriter, value any) error {
	var marker byte
	var encoded []byte
	switch typed := value.(type) {
	case nil:
		marker = 'n'
	case int64:
		marker = 'i'
		encoded = make([]byte, 8)
		binary.BigEndian.PutUint64(encoded, uint64(typed))
	case float64:
		marker = 'f'
		encoded = make([]byte, 8)
		binary.BigEndian.PutUint64(encoded, math.Float64bits(typed))
	case string:
		marker = 's'
		encoded = []byte(typed)
	case []byte:
		marker = 'b'
		encoded = typed
	default:
		return fmt.Errorf("unsupported SQLite storage value %T", value)
	}
	if _, err := writer.Write([]byte{marker}); err != nil {
		return err
	}
	length := make([]byte, 8)
	binary.BigEndian.PutUint64(length, uint64(len(encoded)))
	if _, err := writer.Write(length); err != nil {
		return err
	}
	_, err := writer.Write(encoded)
	return err
}

func verifyUnchangedRetainedObjects(before, after legacySchemaFingerprint) error {
	for _, key := range []string{
		schemaObjectKey("index", "submission_attempts_submitted_at_idx"),
		schemaObjectKey("index", "submission_attempts_puzzle_status_idx"),
		schemaObjectKey("table", "sqlite_sequence"),
	} {
		if before.objects[key] != after.objects[key] {
			return fmt.Errorf("verify retired schema: retained object %s changed", strings.SplitN(key, "\x00", 2)[1])
		}
	}
	return nil
}

func verifyRetainedSequence(before, after map[string]int64) error {
	want, existed := before["submission_attempts"]
	got, remains := after["submission_attempts"]
	if existed != remains || (existed && want != got) {
		return fmt.Errorf("verify retired schema: submission_attempts sequence changed")
	}
	if len(after) > 1 || (len(after) == 1 && !remains) {
		return fmt.Errorf("verify retired schema: unexpected sequence rows remain")
	}
	return nil
}

func verifySQLiteIntegrity(ctx context.Context, runner legacySQLRunner) error {
	rows, err := runner.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("foreign_key_check: %w", err)
	}
	if rows.Next() {
		rows.Close()
		return fmt.Errorf("foreign_key_check reported a violation")
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("foreign_key_check: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("foreign_key_check: %w", err)
	}
	rows, err = runner.QueryContext(ctx, `PRAGMA quick_check`)
	if err != nil {
		return fmt.Errorf("quick_check: %w", err)
	}
	defer rows.Close()
	checks := 0
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			return fmt.Errorf("quick_check: %w", err)
		}
		checks++
		if result != "ok" {
			return fmt.Errorf("quick_check: %s", result)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("quick_check: %w", err)
	}
	if checks != 1 {
		return fmt.Errorf("quick_check returned %d results", checks)
	}
	return nil
}

func countRows(ctx context.Context, runner legacySQLRunner, query string) (int64, error) {
	var count int64
	if err := runner.QueryRowContext(ctx, query).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func compactSchemaSQL(value string) string {
	return strings.Map(func(character rune) rune {
		if unicode.IsSpace(character) {
			return -1
		}
		return character
	}, value)
}

func schemaObjectKey(objectType, name string) string {
	return objectType + "\x00" + name
}

func schemaKeySetsEqual(left, right map[string]legacySchemaObject) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func hasHistoricalSchemaIndicator(objects map[string]legacySchemaObject) bool {
	for _, name := range []string{"users", "sessions", "email_verifications", "user_preferences", "user_solutions", "submission_attempts_user_id_idx"} {
		for _, objectType := range []string{"table", "index"} {
			if _, ok := objects[schemaObjectKey(objectType, name)]; ok {
				return true
			}
		}
	}
	return false
}

func unsupportedLegacyObjectSet(actual, expected map[string]legacySchemaObject) error {
	var extra []string
	for key := range actual {
		if _, ok := expected[key]; !ok {
			extra = append(extra, strings.SplitN(key, "\x00", 2)[1])
		}
	}
	sort.Strings(extra)
	if len(extra) != 0 {
		return unsupportedLegacyVariant(extra[0], "object is not allowlisted")
	}
	var missing []string
	for key := range expected {
		if _, ok := actual[key]; !ok {
			missing = append(missing, strings.SplitN(key, "\x00", 2)[1])
		}
	}
	sort.Strings(missing)
	if len(missing) != 0 {
		return unsupportedLegacyVariant(missing[0], "required object is missing")
	}
	return unsupportedLegacyVariant("main schema", "object inventory does not match")
}

func unsupportedLegacyVariant(object, reason string) error {
	return fmt.Errorf("unsupported legacy schema variant: %s: %s", object, reason)
}
