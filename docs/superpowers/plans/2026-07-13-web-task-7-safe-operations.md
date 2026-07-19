# Web hardening Task 7 replan: safe evidence tooling, build context, and operations runbook

Status: approved for implementation on 2026-07-13 after independent data-preservation, runtime/tooling, and operations-safety review.

Reason for replan: read-only live preflight found that the original Task 7 can print an interpolated secret with `docker compose config`, has no canonical digest producer, omits new runtime variables and immutable image selection from Compose, and does not guard against a sibling checkout using the same default Compose project/container identity.

Milestones 7A/7B land repository tooling and documentation only. Their gates do not build or deploy an image, stop/recreate a service, inspect secret values, read the live database, create a backup, set retirement to `confirmed`, promote branches, or claim that any production operations gate has been completed. Final repository QA may build and smoke a uniquely tagged local image against synthetic external-temp fixtures only; production operations remain separately authorized.

## Milestone 7A: evidence and build-context tooling

### Ownership

- Create `internal/submissionevidence/evidence.go` and tests
- Create `internal/submissionfixture/path.go` and tests for the shared canonical path/identity/sidecar guards and structured SQLite URI construction used by both tools
- Refactor only the retained-row digest portion of `cmd/server/legacy_retirement.go` and its tests to consume that package without changing Task 6 behavior
- Create `cmd/submissions-audit/main.go` and tests
- Create separately guarded `cmd/submissions-reconcile/main.go` and tests for disposable-copy WAL reconciliation only
- Modify `Dockerfile` to build and ship static `/app/submissions-audit` and `/app/submissions-reconcile` binaries alongside the unchanged server entrypoint, and add an OCI revision label populated by a non-secret build argument
- Replace `.dockerignore` with a reviewed exclude-all/allowlist policy
- Add root/nested `.env*` protections to `.gitignore` while retaining an explicit example-file exception if one is later added
- Create executable `scripts/verify_dockerignore.sh`
- Create executable fixture/self-test coverage for the verifier

No Compose, README, AGENTS, runbook, Docker build, live DB, or deployment mutations in 7A.

### Shared canonical submission evidence

- Before extraction, add characterization tests around the current Task 6 implementation and record literal count/SHA-256 golden vectors for an empty fixture and a mixed-storage fixture. These vectors are the compatibility oracle; before/after migration calls to the same helper are not sufficient by themselves.
- Extract the already-reviewed Task 6 algorithm, not a second implementation: explicit 12 retained columns in ID order; SQLite storage-class marker; explicit NULL; length-prefixed bytes; SHA-256; count.
- Task 6 before/after verification must continue using exactly this shared package. Existing migration tests remain green, and the shared package plus CLI independently assert the pre-extraction literal golden vectors so markers, endianness, column order, and empty-input behavior cannot drift together.
- The package accepts a narrow query interface and returns a comparable `Evidence{Count int64, Digest [32]byte}`. Hex formatting exists only at the CLI boundary. It never logs or returns row values.
- Unit tests cover both literal goldens, all storage classes, NULL versus empty, boundary/collision cases, field order, row order, and unsupported driver types.

### Copied-fixture audit CLI

- The immutable deployment image ships `/app/submissions-audit`; local development may use `go run ./cmd/submissions-audit`. The runbook executes the image-pinned binary with `--pull never`, `--network none`, a read-only root filesystem, all capabilities dropped, no-new-privileges, an explicit nonzero audit UID/GID, and a read-only bind mount containing only the disposable copied fixture.
- Require exactly one explicit, lexically clean absolute regular-file path with a SQLite extension through the shared fixture guard. Reject relative/non-clean paths, a symlink in any path component, hard links (`nlink != 1`), directories, missing files, extra arguments, sibling `-wal`, `-shm`, or `-journal` files, `/data/submissions.db`, and the checkout's default `data/submissions.db`; canonicalize before known-path comparison and use same-file comparison when a known path exists. The CLI cannot detect every bind-mount alias or prove provenance beyond these guards, so the runbook's stopped-service/copy/identity gate remains mandatory and uses a deliberately different copy filename.
- After sidecars have been reconciled on the disposable copy, build the SQLite URI with structured path/query escaping and open only with exactly `mode=ro` and `immutable=1`; never concatenate an unescaped filename into a DSN. Never create/ensure/migrate schema, checkpoint, VACUUM, write a sidecar, or invoke the retirement path.
- Admit only an ordinary `submission_attempts` table, never a view or virtual table. Validate the exact visible metadata of the 12 canonical retained columns, including an exact `INTEGER PRIMARY KEY` `id` that gives a total order and no hidden/generated replacement. Accept either exactly the current 12-column shape or the historical shape with the one exact trailing nullable `user_id INTEGER`; cover both historical construction paths and the current native-drop shape. Whole-database allowlisting remains Task 6's responsibility.
- Require exactly one `quick_check` result equal to `ok` and zero `foreign_key_check` rows, then capture canonical evidence. Stdout is exactly `submission_count=<decimal>` followed by `submission_sha256=<64 lowercase hex>`; diagnostics use stderr and never echo equations, emails, tokens, supplied paths/DSNs, sentinel row values, or environment data.
- Tests assert literal golden CLI output rather than merely comparing two callers of the same package. They prove structured URI parameters, force a DDL attempt through the production audit opener and require a read-only failure, prove bytes/mtime/no-sidecar preservation, and cover malformed/current/historical fixtures, both historical construction paths, current native-drop shape, a reconciled WAL-mode copy, URI-metacharacter filenames, view/virtual-table substitution, missing/hidden/generated/wrong-type/non-PK ID columns, unsupported trailing columns, hard links, final- and parent-component symlinks, non-clean paths, known live paths, every path/sidecar refusal, and path/DSN/row-sentinel error redaction.

### Disposable-copy WAL reconciliation

- Ship `/app/submissions-reconcile` as a separate state-changing tool; the audit binary never imports or invokes it. Require an exact `--confirm-disposable-copy` token plus one guarded path, and consume the same shared absolute/clean/canonical/no-symlink/no-hardlink/known-live-path checks before opening with a structurally escaped `mode=rw` (never create) URI. Independently `lstat` the main DB, WAL, and SHM: every present file must be regular, canonical, non-symlinked through every ancestor, owned by the expected audit UID/GID, and have exactly one hard link. Require WAL/SHM to appear as a matched pair; reject either sidecar alone and any owner/identity/link mismatch before SQLite opens.
- Run it only from the verified digest-pinned application image with `--pull never`, no network, a read-only container root, all capabilities dropped, no-new-privileges, and the same dedicated nonzero UID/GID. Mount only the `0700` UID-owned disposable reconciliation directory read-write; its main DB and copied sidecars use the least modes needed by that UID. No archive, repository directory, or authoritative volume is mounted. After successful close/sidecar checks, make the reconciled main copy `0400` and remount that single file read-only for audit.
- The reconciler operates only on the staged disposable main database and its copied WAL/SHM files while no other process has the copy open. It records no row values, runs `PRAGMA wal_checkpoint(TRUNCATE)`, and requires the single exact result `busy=0, log=0, checkpointed=0`. After closing SQLite, it re-lstats every remaining file and requires the pre-open guarded device/inode/link/owner identities to be unchanged plus WAL absent or size zero. SHM is transient shared-memory state and may normally remain nonempty (for example 32 KiB); only after the exact successful checkpoint, close, stable-identity checks, empty/absent WAL check, and dedicated-mount/no-other-opener invariant may it unlink that same guarded SHM and then the empty WAL if present. Busy/nonzero checkpoint output, a nonempty WAL, or any identity failure detected before cleanup unlinks nothing and fails.
- The two guarded sidecar unlinks are necessarily sequential, not atomic. Once cleanup begins, any cleanup I/O failure returns only the generic cleanup error and makes the entire dedicated disposable working directory unusable and discard-required; it is never audited, retried in place, or reused. Discard the directory as a unit, recreate a fresh complete DB/WAL/SHM working copy from the untouched encrypted/archive restore, and rerun from the initial guards. No archive, source, repository directory, or authoritative volume is mounted into this operation, so a cleanup failure cannot mutate them. Do not claim that both transient sidecars remain after a cleanup-stage failure.
- It refuses rollback journals, unexpected/pair-mismatched sidecar state, missing/non-regular/aliased files, and every known live path. Like the audit CLI, it cannot infer arbitrary source/archive provenance; safety depends on the runbook mounting only the dedicated disposable working directory and never mounting the encrypted archive or authoritative volume.
- Integration tests disable automatic checkpointing, commit a sentinel row that exists only in a non-empty WAL, copy the complete DB/WAL/SHM set while the source is quiescent, prove audit refuses the unreconciled copy, run the exact production reconciliation entrypoint, and prove immutable audit includes the WAL-only row afterward. Hashes/bytes for the source and archive copy remain unchanged. Independently hard-link and symlink WAL and SHM to sentinel source/archive files, vary owner/pair state, and prove pre-open refusal plus unchanged bytes. Cover the normal nonzero 32 KiB SHM after a successful truncate, busy/nonzero checkpoint results, and an inode swap; every failure before cleanup unlinks nothing and preserves sidecar bytes. Inject a second-unlink failure after the guarded SHM unlink and prove the exact generic cleanup error, stable main identity, unchanged remaining WAL identity/bytes, untouched source/archive/authoritative sentinels, no success result, and the explicit discard-and-recreate contract for the now-invalid disposable directory.

### Docker build-context allowlist

- Start excluded; allow only Dockerfile, go.mod, go.sum, the explicitly enumerated current `cmd` and `internal` package directories with direct-child `*.go` files, the exact frontend manifests/config/index files, direct-child `*.ts`/`*.tsx`/`*.css` under the enumerated `frontend/src` directory, and direct-child `*.png` files under the enumerated `frontend/public`, `badges`, and `how-to-play` directories. Re-deny each directory's contents immediately after admitting the parent, then admit only its reviewed extensions; never use a broad recursive negation.
- Finish with sensitive deny rules for root/nested `data/`, SQLite databases and `-wal`/`-shm`/`-journal`/backup variants, root/nested `log` and `logs` directories, `*.log`, `*.ndjson`, `*.jsonl`, `.env`/`.env.*`, dependency/build/browser artifacts, `.git`, `.superpowers`, and temp/backup directories. Keep `cmd/server/public/**` denied because the frontend stage populates it later. No later negation may reopen a protected path; arbitrary JSON/TXT and other non-allowlisted extensions in backend or frontend source/asset directories remain excluded even when they are not under a named log directory.
- The verifier is executable Bash with `set -euo pipefail`, resolves the repo from its own location, reads only `.dockerignore` plus `.gitignore`, and creates fixtures only under external `mktemp` with cleanup trap. It never traverses/stats/hashes/copies/creates under repository `data/`.
- Treat the policy as a reviewed exact allowlist: reject unknown negations/order changes that can bypass final denies; prove protected synthetic root+nested paths are excluded and required build inputs remain included.
- Self-tests prove valid rules pass; removal of every protection or enumerated source class fails; malicious broad recursive negations plus final reopens of root/nested databases, `.env`, log/NDJSON/JSONL, arbitrary backend/frontend JSON/TXT, and stale server-public inputs fail; every current required file class remains admitted; and root/nested `.env*` Git-ignore protections cannot be removed or broadly negated (apart from an exact reviewed example-file exception).

### 7A gates and commit

```bash
go test ./internal/submissionevidence ./internal/submissionfixture ./cmd/submissions-audit ./cmd/server -count=1
go test ./cmd/submissions-reconcile -count=1
go test -race ./internal/submissionevidence ./internal/submissionfixture ./cmd/submissions-audit ./cmd/submissions-reconcile ./cmd/server -count=1
go test -count=1 ./...
go vet ./...
bash -n scripts/verify_dockerignore.sh scripts/verify_dockerignore_test.sh
scripts/verify_dockerignore_test.sh
scripts/verify_dockerignore.sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /dev/null ./cmd/server
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /dev/null ./cmd/submissions-audit
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /dev/null ./cmd/submissions-reconcile
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /dev/null ./cmd/server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /dev/null ./cmd/submissions-audit
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /dev/null ./cmd/submissions-reconcile
git diff --check
```

Commit after independent review: `chore(ops): add safe deployment evidence tools`

## Milestone 7B: Compose wiring and the operational runbook

### Ownership

- Create `docs/runbooks/submissions-database.md`
- Modify `docker-compose.yml`
- Modify `README.md`
- Modify `AGENTS.md`
- Create executable non-outputting `scripts/verify_compose.sh` and mutation/self-test `scripts/verify_compose_test.sh`
- Create read-only `scripts/verify_deployment_identity.sh` plus a fake-Docker mutation/self-test; the repository verification invokes only the self-test, never a live target

No image build/deploy, service mutation, live DB/secret inspection, backup, or activation in 7B.

### Compose safety contract

- Add safe-default pass-through for `TRUSTED_PROXY_CIDRS`, `TRUSTED_CLOUDFLARE_PROXY_CIDRS`, `MAX_CONCURRENT_HINT_SOLVES`, and `RETIRE_LEGACY_ACCOUNT_DATA`; retirement default is always empty.
- Add `CRACKLEDATE_IMAGE` selection so an immutable new image and recorded prior image can be chosen without rebuilding. Dockerfile OCI revision metadata must be populated from the intended git SHA at image build. Preserve an explicit local build path, but require `--no-build --pull never` on production `compose up` maintenance and rollback commands. Do not claim that `compose run` supports `--no-build` or `compose create` supports `--no-deps`; the installed Compose CLI exposes neither combination needed here.
- Make restart policy overrideable and quote its interpolation so the one-shot maintenance run can use string `no` and will not loop on expected linked-data refusal.
- Make the concrete named volume selectable with `name: ${CRACKLEDATE_SUBMISSIONS_VOLUME:-${COMPOSE_PROJECT_NAME:-crackledate-web}_submissions}`; the runbook records and verifies the resolved mount before any start and uses this variable for clean rollback volume swaps. A focused synthetic Compose test must prove an explicit project name changes this default and an explicit volume override wins.
- Remove the static `container_name`; runbook commands address the service through explicit Compose project/config identity. This permits isolated explicitly named projects and removes the global fixed-name collision; two casual invocations from same-basename checkouts can still choose the same default project, so README/runbook commands must always provide distinct explicit project names.
- Never embed a secret, production CIDR, volume name, image digest, confirmation flag, or production topology fact in repository defaults.
- All config validation uses `docker compose config --quiet`; forbid outputting `docker compose config`, environment dumps, and raw `docker inspect` because they can expose interpolated secrets.
- `scripts/verify_compose.sh` statically enforces the exact pass-through/default-empty retirement contract, quoted restart interpolation, immutable-image selector, absence of `container_name`, and the exact top-level project-derived volume-name expression, then invokes only `docker compose config --quiet`. Its external-temp mutation/self-test proves every required contract removal/change fails, a distinct explicit project changes the default volume, and an explicit volume override wins, without rendering the repository Compose configuration or environment.
- Production commands always pass one approved absolute `--env-file`, disable default env-file discovery, and execute from a minimal allowlisted process environment so inherited Compose variables cannot override the approved source. Only the exact command-scoped retirement activation may override one reviewed key. The runbook verifies the file's expected owner and restrictive mode without printing contents, while the identity guard proves `CLIENT_HASH_SECRET` is present and nonempty without rendering it. Outside the one command-scoped activation, it also proves retirement is exactly empty. Root/nested `.env*` files are git- and build-context ignored.

### Deployment identity guard

The runbook begins with a stop-if-unknown safety banner and records, before any mutation:

- Docker context/host;
- absolute Compose config path and project directory;
- explicit project name, service, resolved container, and named volume;
- current immutable image ID/digest and intended git SHA;
- reverse-proxy drain owner/route and immediate network peer.

Use correct global syntax `docker --context ... compose ...` plus explicit `--env-file`, `-f`, `--project-directory`, and `--project-name` on every command. Use narrowly filtered format templates only for the required non-secret context/label/name, image ID, OCI revision, restart policy, `/data` mount name/destination, exact `SUBMISSIONS_PATH`, secret-present/nonempty boolean, and exact empty-versus-confirmed retirement-state assertion; never render the complete container environment. Forbid raw inspect/config/env output. The locally observed sibling checkout/project is not persisted as production truth.

Before any stop, `scripts/verify_deployment_identity.sh` must automatically require exact equality between approved inputs and the resolved container's Compose project/service/working-directory/config-file labels, container ID, immutable image ID, OCI revision/intended git SHA, and `/data` named-volume mount. It enumerates every container attached to that volume and blocks unknown or concurrently running consumers. The runbook separately records the owner attestation that no host process/external reconciler can write the volume. Any mismatch or unknown/multiple consumer stops the procedure.

Production requires an explicitly supplied `CRACKLEDATE_SUBMISSIONS_VOLUME` that already exists and exactly matches the approved current container's `/data` mount; a typo or project-derived default must never be allowed to auto-create an empty production volume. The project-derived Compose default is local-development behavior only. Rollback is the sole intentional new-volume path and uses an explicitly created, inspected-empty replacement name.

### Proxy and configuration gate

- Record generic and Cloudflare proxy CIDRs separately; default both empty.
- Identify the immediate peer from authoritative deployment/network configuration, never from request header values.
- Require a controlled sanitizer/overwrite test before trusting forwarding/CF headers; spoofed public headers must not influence identity or analytics.
- Record `CLIENT_HASH_SECRET` custody/owner only, never its value.
- Validate with `docker compose config --quiet` and a non-outputting script/convention test that required variables are wired and retirement defaults empty. The approved env source must leave `SUBMISSIONS_PATH` exactly `/data/submissions.db`; no production override to a host or alternate in-container path is permitted.

### Quiesce, encrypted backup, and copied-fixture evidence

- Drain/block proxy traffic, set and verify the approved app container's restart policy to `no`, then stop only that identity-verified app service and confirm stopped. Never use `down -v`.
- Record the authoritative named volume. Copy the complete database plus SQLite sidecars through a read-only volume mount into an encrypted timestamped artifact outside the repository/build context, with `umask 077`, recipient/key ID, tool/version, owner/location/access/retention, and SHA-256 of the encrypted artifact. No plaintext backup artifact remains.
- Restore/decrypt only into a disposable external directory/volume. Reconcile/checkpoint copied sidecars using `/app/submissions-reconcile` from the exact pinned new application image, then require one `quick_check=ok`, zero `foreign_key_check` rows, schema/object/count/link inventory, and the shared read-only submissions-audit digest. Never display row values. Any separate backup/copy helper image is digest-pinned, verified by exact image ID, and run with `--pull never`.
- The runbook must carry the reconciler cleanup-failure contract verbatim: never audit, retry in place, or reuse a working directory after the generic cleanup error. Discard that dedicated directory as a unit, recreate a fresh complete DB/WAL/SHM working copy from the untouched encrypted/archive restore, and rerun all initial guards; do not attempt a sidecar-by-sidecar repair or claim both sidecars survived.
- Stage the single reconciled audit copy in an external directory owned by a dedicated nonzero `AUDIT_UID:AUDIT_GID`, with directory mode `0700` and file mode `0400`; verify those exact properties before launch and pass the same numeric identity through `docker run --user`. Never make a submissions fixture group/world-readable merely to accommodate the image's default UID, and reject audit UID 0. Delete the plaintext staging directory after the recorded checks.
- Record account-table counts, user_solutions count, non-null submission user_id count, explicit account-data deletion approval, and linked-data disposition. Any linked count blocks activation.
- Before touching the authoritative volume, perform the full one-shot confirmed retirement rehearsal against the restored disposable volume with the exact digest-pinned new application image and its verified OCI revision. Use the same stopped-container assertions, start once with restart disabled, then stop and require unchanged canonical submission evidence, current schema, no retired objects, quick/integrity checks, and no sidecars. A linked-data refusal or any rehearsal discrepancy blocks production; the authoritative volume remains unchanged and quiesced.

### One-shot maintenance and rollback

- Record digest-qualified new and prior image references, exact image IDs, OCI revision labels, and the provenance/attestation that maps the new revision to the intended git SHA. Pin the audit, reconciliation, backup, and checkpoint invocations with verified image IDs plus `--pull never`; mutable tags alone are forbidden.
- With proxy traffic drained and the app stopped, set the new immutable image, same authoritative volume, restart policy `no`, and exact confirmed activation only in that command's environment (never persist confirmed in `.env` or a repository file). Create the service stopped with explicit project identity using `compose up --no-start --no-deps --force-recreate --no-build --pull never SERVICE`; do not use `compose run` and do not start directly.
- Before the sole confirmed start, automatically assert the stopped container's exact image ID/revision, `SUBMISSIONS_PATH=/data/submissions.db`, authoritative `/data` named volume, `RestartPolicy.Name=no`, nonempty secret boolean, and retirement value `confirmed`, without displaying any other environment. Only after every assertion passes may `compose start SERVICE` run. Wait for the bounded startup/health gate, then stop it. This is the only start permitted while activation is confirmed.
- Expected linked/unsupported refusal means stop; prove canonical copied-fixture evidence unchanged and do not loop/retry blindly.
- On success, stop, create a new copied fixture, and require the same submission count/digest, one `quick_check=ok`, zero foreign-key violations, expected current schema, and no retired objects. Then use `compose up --no-start --no-deps --force-recreate --no-build --pull never SERVICE` with the flag removed. Before start, automatically prove exact image/revision, `SUBMISSIONS_PATH=/data/submissions.db`, authoritative mount, normal approved restart policy, nonempty secret boolean, and retirement exactly empty; only then start it.
- Pre-write rollback trigger: any migration/start/evidence/direct-health failure or any failure during the read-only canary described below. Preserve the failed volume; explicitly create and inspect an empty replacement volume (or empty/recreate the authoritative volume only under separately recorded owner approval), verify/decrypt and restore the complete archive with numeric ownership/modes, and never overlay onto a populated volume where absent backup files/sidecars could survive. Reconcile/verify a disposable restore first.
- Reconcile and fully verify the disposable restored copy only; never mount the replacement/future-authoritative volume into the state-changing reconciler. Copy the verified reconciled main DB, with no sidecars, into the explicitly empty replacement using recorded numeric ownership/modes. Before attaching or starting the prior app, take a fresh read-only copied fixture back out of that replacement and require the recorded pre-maintenance count/digest, exact pre-maintenance schema/object inventory (historical when retirement was applicable), one `quick_check=ok`, zero foreign-key violations, no sidecars, and exact numeric ownership/modes. A truncated/partial/mis-owned replacement blocks start; the app must never be allowed to open and normalize it first.
- Select the verified replacement with explicit `CRACKLEDATE_SUBMISSIONS_VOLUME`, create the stopped service with the prior immutable image and confirmation empty via `compose up --no-start --no-deps --force-recreate --no-build --pull never SERVICE`, then automatically assert the prior image/revision, exact DB path, replacement `/data` mount, normal restart policy, nonempty secret boolean, and empty retirement flag. Only then start and health/smoke check. Never use indiscriminate `down -v`.
- On both the successful forward path and pre-write rollback, keep all traffic drained until bounded direct health and non-mutating static/puzzle/hint smoke checks pass. Then permit a bounded public canary while the proxy still blocks submission POSTs and any other storage writes; monitor health and filtered error logs under an explicit archive-rollback trigger. Never insert a synthetic production submission as a smoke test.
- Enable submission writes only after the canary passes and the recorded owner approves cutover. From that moment, blind restore of the pre-maintenance archive is forbidden because it could discard newly accepted rows. A post-write failure must immediately block writes/re-drain traffic, preserve and encrypt the current failed volume, capture current canonical evidence, and follow an owner-approved forward repair or lossless delta-merge/recovery plan. Restoring the old archive after writes requires explicit documented data-loss approval if lossless recovery is impossible; it is not called automatic rollback.
- VACUUM is offline-only after separate backup/free-space approval; never part of startup or this automated workflow.

### Cookie compatibility and unresolved owner fields

- Record the shipping release, removal release/window, and owner for the legacy cookie middleware.
- Keep explicit placeholders for authoritative production context/config/project/service/volume; proxy topology/CIDRs/sanitizer proof; backup recipient/custody/owner/location/retention/access/deletion; production inventory/deletion approval/link disposition; new/prior images; maintenance window; pre-write rollback trigger; write-enable approval; post-write delta-recovery owner/plan and any data-loss approval; cookie releases/owner.
- Landing code/docs does not fill or close these operational decisions.

### 7B gates and commit

```bash
scripts/verify_dockerignore_test.sh
scripts/verify_dockerignore.sh
scripts/verify_compose_test.sh
scripts/verify_compose.sh
scripts/verify_deployment_identity_test.sh
docker compose config --quiet
go test -count=1 ./...
go vet ./...
git diff --check
```

Do not run `docker build`, `docker compose build/up/down/stop/rm`, or any audit against a live database during repository verification.

Commit after independent review: `docs(ops): add submissions retirement runbook`

## Final web-hardening runtime QA (after 7A/7B)

Run the approved local browser interception matrix for hint and validation behavior and the server limit/config tests. Only after the allowlist is committed, build a uniquely tagged local image with an explicit nonempty revision build argument equal to the committed `git rev-parse HEAD`; inspect only the non-secret label and require `org.opencontainers.image.revision` to equal that SHA. Also assert the image entrypoint remains exactly `/app/crackledate-web`, its default user remains nonroot, and both `/app/submissions-audit` and `/app/submissions-reconcile` are executable. Create a synthetic non-empty WAL copy, reconcile it with the packaged binary under the exact pinned-image/nonzero-UID/`0700` directory/read-write-copy sandbox contract, then make the result `0400` and prove the packaged audit binary succeeds with a single read-only fixture mount. Both tool smokes run with no network, a read-only root, dropped capabilities, and no-new-privileges; neither may use repository `data/` or any live volume. Do not activate retirement or touch the live Compose project/database. Production backup/migration/rollback execution remains a separately authorized operations change.
# Superseded

This historical plan describes safeguards for the former stateful submission service. The approved July 18, 2026 stateless release replaces its storage and client-hash requirements; only the legacy-volume preservation safeguards remain relevant through the active decommission runbook.
