package submissionevidence

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"fmt"
	"io"
	"math"
)

const retainedSubmissionsQuery = `SELECT
	id,
	submitted_at,
	puzzle_date,
	equation,
	value,
	solve_time_seconds,
	difficulty,
	hard_mode,
	platform,
	app_version,
	submission_status,
	rejection_reason
FROM submission_attempts
ORDER BY id`

const retainedColumnCount = 12

// Evidence identifies the canonical retained submission rows without exposing
// any of their values.
type Evidence struct {
	Count  int64
	Digest [sha256.Size]byte
}

// Queryer is the narrow database surface required to capture evidence.
type Queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Capture hashes the canonical retained columns in primary-key order.
func Capture(ctx context.Context, queryer Queryer) (Evidence, error) {
	rows, err := queryer.QueryContext(ctx, retainedSubmissionsQuery)
	if err != nil {
		return Evidence{}, err
	}
	defer rows.Close()

	hasher := sha256.New()
	var count int64
	for rows.Next() {
		values := make([]any, retainedColumnCount)
		destinations := make([]any, retainedColumnCount)
		for index := range values {
			destinations[index] = &values[index]
		}
		if err := rows.Scan(destinations...); err != nil {
			return Evidence{}, err
		}
		for _, value := range values {
			if err := encodeSQLiteValue(hasher, value); err != nil {
				return Evidence{}, err
			}
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return Evidence{}, err
	}

	var digest [sha256.Size]byte
	copy(digest[:], hasher.Sum(nil))
	return Evidence{Count: count, Digest: digest}, nil
}

func encodeSQLiteValue(writer io.Writer, value any) error {
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
		return fmt.Errorf("unsupported SQLite storage type %T", value)
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
