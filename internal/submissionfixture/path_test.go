package submissionfixture

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSQLiteURIsUseStructuredEscapingAndExactModes(t *testing.T) {
	path := filepath.Join(canonicalTempDir(t), "copy ?#%&mode=rw.sqlite3")
	for _, test := range []struct {
		name      string
		uri       string
		wantQuery url.Values
	}{
		{name: "audit", uri: ReadOnlyURI(path), wantQuery: url.Values{"immutable": {"1"}, "mode": {"ro"}}},
		{name: "reconcile", uri: ReadWriteURI(path), wantQuery: url.Values{"mode": {"rw"}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			parsed, err := url.Parse(test.uri)
			if err != nil {
				t.Fatalf("url.Parse: %v", err)
			}
			if parsed.Scheme != "file" || parsed.Path != path {
				t.Fatalf("URI = scheme %q path %q, want file and original path", parsed.Scheme, parsed.Path)
			}
			if got := parsed.Query(); !equalValues(got, test.wantQuery) {
				t.Fatalf("query = %#v, want %#v", got, test.wantQuery)
			}
			if strings.Contains(strings.SplitN(test.uri, "?", 2)[0], "#") {
				t.Fatalf("URI fragment injection remained unescaped: %q", test.uri)
			}
		})
	}
}

func TestGuardAuditAcceptsOnlyCanonicalRegularUnaliasedSQLiteCopies(t *testing.T) {
	root := canonicalTempDir(t)
	valid := writeFixture(t, filepath.Join(root, "copy.sqlite"), "fixture")
	identity, err := GuardAudit(valid, nil)
	if err != nil {
		t.Fatalf("GuardAudit(valid): %v", err)
	}
	if identity.Path != valid || identity.Links != 1 || identity.Size != int64(len("fixture")) {
		t.Fatalf("identity = %#v", identity)
	}

	directory := filepath.Join(root, "directory.db")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	missing := filepath.Join(root, "missing.db")
	wrongExtension := writeFixture(t, filepath.Join(root, "copy.txt"), "fixture")
	hardSource := writeFixture(t, filepath.Join(root, "hard-source.db"), "fixture")
	hardLink := filepath.Join(root, "hard.db")
	if err := os.Link(hardSource, hardLink); err != nil {
		t.Fatalf("Link: %v", err)
	}
	knownAlias := filepath.Join(root, "known-alias.db")
	if err := os.Symlink(valid, knownAlias); err != nil {
		t.Fatalf("Symlink known alias: %v", err)
	}
	finalSymlink := filepath.Join(root, "final.db")
	if err := os.Symlink(valid, finalSymlink); err != nil {
		t.Fatalf("Symlink final: %v", err)
	}
	realParent := filepath.Join(root, "real-parent")
	if err := os.Mkdir(realParent, 0o700); err != nil {
		t.Fatalf("Mkdir real parent: %v", err)
	}
	parentTarget := writeFixture(t, filepath.Join(realParent, "parent.db"), "fixture")
	_ = parentTarget
	linkedParent := filepath.Join(root, "linked-parent")
	if err := os.Symlink(realParent, linkedParent); err != nil {
		t.Fatalf("Symlink parent: %v", err)
	}

	tests := []struct {
		name  string
		path  string
		known []string
	}{
		{name: "relative", path: "copy.db"},
		{name: "non-clean", path: root + string(filepath.Separator) + "child" + string(filepath.Separator) + ".." + string(filepath.Separator) + "copy.sqlite"},
		{name: "missing", path: missing},
		{name: "directory", path: directory},
		{name: "wrong extension", path: wrongExtension},
		{name: "hard link", path: hardLink},
		{name: "final symlink", path: finalSymlink},
		{name: "parent symlink", path: filepath.Join(linkedParent, "parent.db")},
		{name: "literal known live path", path: valid, known: []string{valid}},
		{name: "canonical same-file known live path", path: valid, known: []string{knownAlias}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := GuardAudit(test.path, test.known)
			if err == nil {
				t.Fatal("expected path refusal")
			}
			if strings.Contains(err.Error(), test.path) {
				t.Fatalf("diagnostic leaked supplied path: %v", err)
			}
		})
	}
}

func TestGuardAuditRejectsEverySiblingSidecarWithoutReadingIt(t *testing.T) {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		t.Run(suffix, func(t *testing.T) {
			path := writeFixture(t, filepath.Join(canonicalTempDir(t), "copy.db"), "main")
			writeFixture(t, path+suffix, "sentinel-sidecar")
			if _, err := GuardAudit(path, nil); err == nil {
				t.Fatal("expected sidecar refusal")
			}
			content, err := os.ReadFile(path + suffix)
			if err != nil || string(content) != "sentinel-sidecar" {
				t.Fatalf("sidecar changed: %q, %v", content, err)
			}
		})
	}
}

func TestGuardReconcileChecksMainWALAndSHMIdentityLinksAndOwner(t *testing.T) {
	root := canonicalTempDir(t)
	uid, gid := uint32(os.Geteuid()), uint32(os.Getegid())
	createSet := func(t *testing.T) string {
		t.Helper()
		path := writeFixture(t, filepath.Join(root, strings.ReplaceAll(t.Name(), "/", "-")+".db"), "main")
		writeFixture(t, path+"-wal", "wal")
		writeFixture(t, path+"-shm", "shm")
		return path
	}

	valid := createSet(t)
	set, err := GuardReconcile(valid, nil, Owner{UID: uid, GID: gid})
	if err != nil {
		t.Fatalf("GuardReconcile(valid): %v", err)
	}
	if set.WAL == nil || set.SHM == nil || set.Main.Path != valid {
		t.Fatalf("set = %#v", set)
	}

	tests := []struct {
		name   string
		mutate func(*testing.T, string)
		owner  Owner
	}{
		{name: "main owner", mutate: func(*testing.T, string) {}, owner: Owner{UID: uid + 1, GID: gid}},
		{name: "main hard link", mutate: func(t *testing.T, path string) { mustLink(t, path, path+".alias") }, owner: Owner{UID: uid, GID: gid}},
		{name: "wal hard link", mutate: func(t *testing.T, path string) { mustLink(t, path+"-wal", path+"-wal.alias") }, owner: Owner{UID: uid, GID: gid}},
		{name: "shm hard link", mutate: func(t *testing.T, path string) { mustLink(t, path+"-shm", path+"-shm.alias") }, owner: Owner{UID: uid, GID: gid}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := createSet(t)
			test.mutate(t, path)
			if _, err := GuardReconcile(path, nil, test.owner); err == nil {
				t.Fatal("expected identity/owner refusal")
			}
		})
	}
}

func TestOwnerValidationIndependentlyRejectsMainWALAndSHMMismatches(t *testing.T) {
	want := Owner{UID: 501, GID: 20}
	matching := Identity{UID: want.UID, GID: want.GID}
	wrongUID := Identity{UID: want.UID + 1, GID: want.GID}
	wrongGID := Identity{UID: want.UID, GID: want.GID + 1}
	for _, test := range []struct {
		name string
		main Identity
		wal  Identity
		shm  Identity
	}{
		{name: "main uid", main: wrongUID, wal: matching, shm: matching},
		{name: "main gid", main: wrongGID, wal: matching, shm: matching},
		{name: "wal uid", main: matching, wal: wrongUID, shm: matching},
		{name: "wal gid", main: matching, wal: wrongGID, shm: matching},
		{name: "shm uid", main: matching, wal: matching, shm: wrongUID},
		{name: "shm gid", main: matching, wal: matching, shm: wrongGID},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := validateReconcileOwners(test.main, &test.wal, &test.shm, want); err == nil {
				t.Fatal("owner mismatch unexpectedly accepted")
			}
		})
	}
}

func TestGuardReconcileRejectsPairMismatchJournalAndAliasedSidecars(t *testing.T) {
	tests := []struct {
		name  string
		setup func(*testing.T, string)
	}{
		{name: "wal only", setup: func(t *testing.T, path string) { writeFixture(t, path+"-wal", "wal") }},
		{name: "shm only", setup: func(t *testing.T, path string) { writeFixture(t, path+"-shm", "shm") }},
		{name: "rollback journal", setup: func(t *testing.T, path string) { writeFixture(t, path+"-journal", "journal") }},
		{name: "wal symlink", setup: func(t *testing.T, path string) {
			target := writeFixture(t, filepath.Join(filepath.Dir(path), "wal-source"), "wal")
			mustSymlink(t, target, path+"-wal")
			writeFixture(t, path+"-shm", "shm")
		}},
		{name: "shm symlink", setup: func(t *testing.T, path string) {
			writeFixture(t, path+"-wal", "wal")
			target := writeFixture(t, filepath.Join(filepath.Dir(path), "shm-source"), "shm")
			mustSymlink(t, target, path+"-shm")
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := writeFixture(t, filepath.Join(canonicalTempDir(t), "copy.db"), "main")
			test.setup(t, path)
			if _, err := GuardReconcile(path, nil, Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())}); err == nil {
				t.Fatal("expected sidecar refusal")
			}
		})
	}
}

func TestGuardReconcileErrorsRedactSuppliedAndKnownPaths(t *testing.T) {
	path := writeFixture(t, filepath.Join(canonicalTempDir(t), "secret-reconcile-path.db"), "main")
	writeFixture(t, path+"-wal", "wal")
	writeFixture(t, path+"-shm", "shm")
	_, err := GuardReconcile(path, []string{path}, Owner{UID: uint32(os.Geteuid()), GID: uint32(os.Getegid())})
	if err == nil {
		t.Fatal("expected known-path refusal")
	}
	for _, forbidden := range []string{path, "secret-reconcile-path"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("diagnostic %q leaked %q", err, forbidden)
		}
	}
}

func TestRestatAndRemoveRequireTheSameGuardedIdentity(t *testing.T) {
	path := writeFixture(t, filepath.Join(canonicalTempDir(t), "copy.db"), "main")
	before, err := GuardAudit(path, nil)
	if err != nil {
		t.Fatalf("GuardAudit: %v", err)
	}
	after, err := Restat(before)
	if err != nil || !SameIdentity(before, after) {
		t.Fatalf("Restat = %#v, %v", after, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	writeFixture(t, path, "replacement")
	if _, err := Restat(before); err == nil {
		t.Fatal("expected replaced-inode refusal")
	}
	if err := RemoveIfSame(before); err == nil {
		t.Fatal("expected guarded unlink refusal")
	}
	if content, err := os.ReadFile(path); err != nil || string(content) != "replacement" {
		t.Fatalf("replacement changed: %q, %v", content, err)
	}
}

func canonicalTempDir(t *testing.T) string {
	t.Helper()
	directory := t.TempDir()
	canonical, err := filepath.EvalSymlinks(directory)
	if err != nil {
		t.Fatalf("EvalSymlinks temp dir: %v", err)
	}
	return canonical
}

func writeFixture(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	return path
}

func equalValues(left, right url.Values) bool {
	if len(left) != len(right) {
		return false
	}
	for key, rightValues := range right {
		leftValues := left[key]
		if len(leftValues) != len(rightValues) {
			return false
		}
		for index := range rightValues {
			if leftValues[index] != rightValues[index] {
				return false
			}
		}
	}
	return true
}

func mustLink(t *testing.T, oldPath, newPath string) {
	t.Helper()
	if err := os.Link(oldPath, newPath); err != nil {
		t.Fatalf("Link: %v", err)
	}
}

func mustSymlink(t *testing.T, oldPath, newPath string) {
	t.Helper()
	if err := os.Symlink(oldPath, newPath); err != nil {
		t.Fatalf("Symlink: %v", err)
	}
}
