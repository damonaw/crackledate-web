package submissionevidence

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"io"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

const evidenceTableSQL = `CREATE TABLE submission_attempts (
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

func TestCaptureLiteralGoldens(t *testing.T) {
	tests := []struct {
		name       string
		populate   bool
		wantCount  int64
		wantDigest string
	}{
		{name: "empty", wantCount: 0, wantDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
		{name: "mixed storage", populate: true, wantCount: 2, wantDigest: "816f12befd64dac5a1b7f17ddf5f9b84a768b5049e7d7883884e327b213fd814"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := openEvidenceFixture(t)
			if test.populate {
				insertMixedEvidenceRows(t, db)
			}
			evidence, err := Capture(context.Background(), db)
			if err != nil {
				t.Fatalf("Capture: %v", err)
			}
			if evidence.Count != test.wantCount || fmt.Sprintf("%x", evidence.Digest) != test.wantDigest {
				t.Fatalf("evidence = count %d, digest %x; want count %d, digest %s", evidence.Count, evidence.Digest, test.wantCount, test.wantDigest)
			}
		})
	}
}

func TestEncodeSQLiteValueCoversEveryStorageClass(t *testing.T) {
	values := []any{nil, int64(-1), float64(1.5), "text", []byte{0, 1, 2}}
	for _, value := range values {
		t.Run(fmt.Sprintf("%T", value), func(t *testing.T) {
			hasher := sha256.New()
			if err := encodeSQLiteValue(hasher, value); err != nil {
				t.Fatalf("encodeSQLiteValue(%T): %v", value, err)
			}
			if hasher.Size() != sha256.Size {
				t.Fatalf("unexpected hash size %d", hasher.Size())
			}
		})
	}
}

func TestEncodeSQLiteValueSeparatesNullEmptyAndBoundaries(t *testing.T) {
	digest := func(values ...any) [sha256.Size]byte {
		t.Helper()
		hasher := sha256.New()
		for _, value := range values {
			if err := encodeSQLiteValue(hasher, value); err != nil {
				t.Fatalf("encodeSQLiteValue: %v", err)
			}
		}
		var result [sha256.Size]byte
		copy(result[:], hasher.Sum(nil))
		return result
	}

	for _, pair := range [][2][sha256.Size]byte{
		{digest(nil), digest("")},
		{digest(""), digest([]byte{})},
		{digest("a", "bc"), digest("ab", "c")},
		{digest(int64(1)), digest(float64(1))},
	} {
		if pair[0] == pair[1] {
			t.Fatal("storage marker or length prefix collision")
		}
	}
}

func TestCaptureOrdersFieldsAndRowsCanonically(t *testing.T) {
	left := openEvidenceFixture(t)
	right := openEvidenceFixture(t)
	insertEvidenceRow(t, left, 20, "submitted-a", "date-b")
	insertEvidenceRow(t, left, 10, "submitted-b", "date-a")
	insertEvidenceRow(t, right, 10, "submitted-b", "date-a")
	insertEvidenceRow(t, right, 20, "submitted-a", "date-b")

	leftEvidence, err := Capture(context.Background(), left)
	if err != nil {
		t.Fatalf("Capture left: %v", err)
	}
	rightEvidence, err := Capture(context.Background(), right)
	if err != nil {
		t.Fatalf("Capture right: %v", err)
	}
	if leftEvidence != rightEvidence {
		t.Fatal("insertion order changed canonical ID-ordered evidence")
	}

	swapped := openEvidenceFixture(t)
	insertEvidenceRow(t, swapped, 10, "date-a", "submitted-b")
	insertEvidenceRow(t, swapped, 20, "date-b", "submitted-a")
	swappedEvidence, err := Capture(context.Background(), swapped)
	if err != nil {
		t.Fatalf("Capture swapped: %v", err)
	}
	if swappedEvidence == leftEvidence {
		t.Fatal("field order did not affect canonical evidence")
	}
}

func TestEncodeSQLiteValueRejectsUnsupportedDriverTypesWithoutValues(t *testing.T) {
	sentinel := "secret-row-value-must-not-appear"
	err := encodeSQLiteValue(io.Discard, struct{ Secret string }{Secret: sentinel})
	if err == nil {
		t.Fatal("expected unsupported-type error")
	}
	if got := err.Error(); got == "" || contains(got, sentinel) {
		t.Fatalf("unsafe unsupported-type diagnostic %q", got)
	}
}

func openEvidenceFixture(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "evidence.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(evidenceTableSQL); err != nil {
		t.Fatalf("create evidence table: %v", err)
	}
	return db
}

func insertMixedEvidenceRows(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status, rejection_reason
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		7, []byte{0, 1, 2}, "", "1=1", "", nil, []byte("easy"), 1.5, "web", nil, "accepted", []byte{}); err != nil {
		t.Fatalf("insert mixed row one: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status, rejection_reason
	) VALUES (41, '2026-07-12T00:00:00Z', '2026-07-12', '5+4=9', '9', '', 'hard', 1, 'ios', '', 'rejected', NULL)`); err != nil {
		t.Fatalf("insert mixed row two: %v", err)
	}
}

func insertEvidenceRow(t *testing.T, db *sql.DB, id int, submittedAt, puzzleDate string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO submission_attempts (
		id, submitted_at, puzzle_date, equation, value, solve_time_seconds,
		difficulty, hard_mode, platform, app_version, submission_status, rejection_reason
	) VALUES (?, ?, ?, '1=1', '1', NULL, 'easy', 0, 'web', NULL, 'accepted', NULL)`, id, submittedAt, puzzleDate); err != nil {
		t.Fatalf("insert evidence row: %v", err)
	}
}

func contains(value, substring string) bool {
	for index := 0; index+len(substring) <= len(value); index++ {
		if value[index:index+len(substring)] == substring {
			return true
		}
	}
	return false
}
