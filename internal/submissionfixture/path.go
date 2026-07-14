package submissionfixture

import (
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

var errUnsafeFixture = errors.New("submission fixture is not eligible")

// Owner is the numeric identity required for every reconciliation file.
type Owner struct {
	UID uint32
	GID uint32
}

// Identity records the stable filesystem identity needed around SQLite use.
type Identity struct {
	Path   string
	Device uint64
	Inode  uint64
	Links  uint64
	UID    uint32
	GID    uint32
	Size   int64
}

// ReconcileSet is a guarded main database and its optional matched WAL/SHM pair.
type ReconcileSet struct {
	Main Identity
	WAL  *Identity
	SHM  *Identity
}

// ReadOnlyURI returns the only SQLite URI used by the immutable audit path.
func ReadOnlyURI(path string) string {
	return sqliteURI(path, url.Values{"immutable": {"1"}, "mode": {"ro"}})
}

// ReadWriteURI returns the no-create SQLite URI used by the reconciler.
func ReadWriteURI(path string) string {
	return sqliteURI(path, url.Values{"mode": {"rw"}})
}

func sqliteURI(path string, query url.Values) string {
	return (&url.URL{Scheme: "file", Path: path, RawQuery: query.Encode()}).String()
}

// GuardAudit admits a single immutable copied fixture with no SQLite sidecars.
func GuardAudit(path string, knownPaths []string) (Identity, error) {
	identity, err := guardMain(path, knownPaths)
	if err != nil {
		return Identity{}, errUnsafeFixture
	}
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if exists(path + suffix) {
			return Identity{}, errUnsafeFixture
		}
	}
	return identity, nil
}

// GuardReconcile admits a guarded main file and an optional matched WAL/SHM pair.
func GuardReconcile(path string, knownPaths []string, owner Owner) (ReconcileSet, error) {
	mainIdentity, err := guardMain(path, knownPaths)
	if err != nil || exists(path+"-journal") {
		return ReconcileSet{}, errUnsafeFixture
	}

	walExists := exists(path + "-wal")
	shmExists := exists(path + "-shm")
	if walExists != shmExists {
		return ReconcileSet{}, errUnsafeFixture
	}
	set := ReconcileSet{Main: mainIdentity}
	if !walExists {
		if validateReconcileOwners(mainIdentity, nil, nil, owner) != nil {
			return ReconcileSet{}, errUnsafeFixture
		}
		return set, nil
	}

	wal, err := inspectRegular(path + "-wal")
	if err != nil {
		return ReconcileSet{}, errUnsafeFixture
	}
	shm, err := inspectRegular(path + "-shm")
	if err != nil || validateReconcileOwners(mainIdentity, &wal, &shm, owner) != nil {
		return ReconcileSet{}, errUnsafeFixture
	}
	set.WAL = &wal
	set.SHM = &shm
	return set, nil
}

func guardMain(path string, knownPaths []string) (Identity, error) {
	if path == "" || !filepath.IsAbs(path) || filepath.Clean(path) != path || !hasSQLiteExtension(path) {
		return Identity{}, errUnsafeFixture
	}
	identity, err := inspectRegular(path)
	if err != nil {
		return Identity{}, errUnsafeFixture
	}
	if filepath.Base(identity.Path) == "submissions.db" && filepath.Base(filepath.Dir(identity.Path)) == "data" {
		return Identity{}, errUnsafeFixture
	}
	for _, knownPath := range knownPaths {
		knownCanonical, knownInfo, err := canonicalKnownPath(knownPath)
		if err != nil {
			return Identity{}, errUnsafeFixture
		}
		if identity.Path == knownCanonical {
			return Identity{}, errUnsafeFixture
		}
		if knownInfo != nil {
			candidateInfo, statErr := os.Stat(identity.Path)
			if statErr != nil || os.SameFile(candidateInfo, knownInfo) {
				return Identity{}, errUnsafeFixture
			}
		}
	}
	return identity, nil
}

func hasSQLiteExtension(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".db", ".sqlite", ".sqlite3":
		return true
	default:
		return false
	}
}

func inspectRegular(path string) (Identity, error) {
	if err := rejectSymlinkComponents(path); err != nil {
		return Identity{}, errUnsafeFixture
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != path {
		return Identity{}, errUnsafeFixture
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return Identity{}, errUnsafeFixture
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return Identity{}, errUnsafeFixture
	}
	identity := Identity{
		Path:   canonical,
		Device: uint64(stat.Dev),
		Inode:  uint64(stat.Ino),
		Links:  uint64(stat.Nlink),
		UID:    stat.Uid,
		GID:    stat.Gid,
		Size:   info.Size(),
	}
	if identity.Links != 1 {
		return Identity{}, errUnsafeFixture
	}
	return identity, nil
}

func rejectSymlinkComponents(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return errUnsafeFixture
	}
	volume := filepath.VolumeName(path)
	remainder := strings.TrimPrefix(path, volume)
	remainder = strings.TrimPrefix(remainder, string(filepath.Separator))
	current := volume + string(filepath.Separator)
	for _, component := range strings.Split(remainder, string(filepath.Separator)) {
		if component == "" {
			continue
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return errUnsafeFixture
		}
	}
	return nil
}

func canonicalKnownPath(path string) (string, os.FileInfo, error) {
	if path == "" || !filepath.IsAbs(path) {
		return "", nil, errUnsafeFixture
	}
	clean := filepath.Clean(path)
	info, err := os.Stat(clean)
	if err == nil {
		canonical, evalErr := filepath.EvalSymlinks(clean)
		if evalErr != nil {
			return "", nil, errUnsafeFixture
		}
		return canonical, info, nil
	}
	if !os.IsNotExist(err) {
		return "", nil, errUnsafeFixture
	}
	parent, evalErr := filepath.EvalSymlinks(filepath.Dir(clean))
	if evalErr != nil {
		if !os.IsNotExist(evalErr) {
			return "", nil, errUnsafeFixture
		}
		return clean, nil, nil
	}
	return filepath.Join(parent, filepath.Base(clean)), nil, nil
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil || !os.IsNotExist(err)
}

func validateOwner(identity Identity, owner Owner) error {
	if identity.UID != owner.UID || identity.GID != owner.GID {
		return errUnsafeFixture
	}
	return nil
}

func validateReconcileOwners(main Identity, wal, shm *Identity, owner Owner) error {
	if validateOwner(main, owner) != nil {
		return errUnsafeFixture
	}
	if wal != nil && validateOwner(*wal, owner) != nil {
		return errUnsafeFixture
	}
	if shm != nil && validateOwner(*shm, owner) != nil {
		return errUnsafeFixture
	}
	return nil
}

// Restat verifies that a guarded path still identifies the same regular file.
func Restat(before Identity) (Identity, error) {
	after, err := inspectRegular(before.Path)
	if err != nil || !SameIdentity(before, after) {
		return Identity{}, errUnsafeFixture
	}
	return after, nil
}

// SameIdentity compares security-relevant identity and ownership metadata.
func SameIdentity(left, right Identity) bool {
	return left.Path == right.Path &&
		left.Device == right.Device &&
		left.Inode == right.Inode &&
		left.Links == right.Links &&
		left.UID == right.UID &&
		left.GID == right.GID
}

// RemoveIfSame unlinks only the exact guarded identity.
func RemoveIfSame(identity Identity) error {
	if _, err := Restat(identity); err != nil {
		return errUnsafeFixture
	}
	if err := os.Remove(identity.Path); err != nil {
		return errUnsafeFixture
	}
	return nil
}
