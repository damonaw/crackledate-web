# Submissions database retirement and rollback runbook

> STOP IF ANYTHING IS UNKNOWN. This is a separately authorized production change, not a repository-validation checklist. Do not stop, recreate, start, copy, reconcile, restore, or attach anything until every identity field and owner decision below is recorded and independently approved. A mismatch, missing value, unexpected consumer, linked row, failed check, or ambiguous command ends the procedure with traffic drained and the authoritative volume preserved.

The repository landing of this document does not authorize production work or complete any production gate. It does not identify the production Docker host, volume, proxy, images, owners, backup custody, maintenance window, or retention policy. Secrets and approved proxy CIDRs may exist only in the one approved external, nonsymlink, owner-only environment file. Never put them in this repository, a default-discovered `.env`, shell history, or command output. Image, volume, and restart selectors remain command-scoped; retirement activation is supplied only to each separately approved stopped-create command and is never persisted anywhere.

## Required change record and owners

Keep these fields in the approved change record outside the repository. Every placeholder must have a named owner and evidence before work begins.

| Required field | Owner / evidence placeholder |
| --- | --- |
| Authoritative Docker context, endpoint, and canonical Docker config directory | `UNRESOLVED_CONTEXT_OWNER` |
| Absolute Compose file and project directory | `UNRESOLVED_CONFIG_OWNER` |
| Explicit project, service, container ID, and current volume | `UNRESOLVED_RUNTIME_IDENTITY_OWNER` |
| Immediate network peer; proxy drain route and owner | `UNRESOLVED_PROXY_TOPOLOGY_OWNER` |
| Generic proxy CIDRs, Cloudflare CIDRs, and sanitizer proof | `UNRESOLVED_PROXY_POLICY_OWNER` |
| Approved absolute environment file, owner, mode, and secret custodian | `UNRESOLVED_ENV_AND_SECRET_OWNER` |
| Backup recipient/key ID, tool/version, custody, location, access, retention, and deletion | `UNRESOLVED_BACKUP_OWNER` |
| Production object/count inventory and account-data deletion approval | `UNRESOLVED_DATA_DELETION_OWNER` |
| Linked `user_solutions` and submission `user_id` disposition | `UNRESOLVED_LINKED_DATA_OWNER` |
| Digest-qualified new/prior images, exact image IDs, revisions, provenance/attestation | `UNRESOLVED_RELEASE_OWNER` |
| Maintenance window and pre-write rollback trigger | `UNRESOLVED_MAINTENANCE_OWNER` |
| Public canary and submission-write enable approval | `UNRESOLVED_CUTOVER_OWNER` |
| Post-write forward repair/delta recovery and any data-loss approval | `UNRESOLVED_RECOVERY_OWNER` |
| Legacy cookie shipping release, removal release/window, and owner | `UNRESOLVED_COOKIE_OWNER` |

The owner record must also attest that no host process, external reconciler, backup job, or other non-container writer can access the authoritative volume during the window. Record `AUTO_UPDATERS_DISABLED` only after every image updater, scheduler, and concurrent Docker control-plane actor is disabled for the whole window.

## Command discipline

Use a non-logging shell with history disabled and tracing off. Set variables from the approved change record; the examples deliberately contain no production values.

```bash
set -euo pipefail
set +x
set +o history 2>/dev/null || true
umask 077

: "${SAFE_PATH:?approved minimal executable path}"
: "${APPROVED_DOCKER_CONFIG:?approved canonical absolute Docker config directory}"
: "${APPROVED_DOCKER_CONTEXT:?independently approved Docker context}"
: "${APPROVED_DOCKER_HOST:?independently approved Docker endpoint}"
: "${APPROVED_ENV_FILE:?one approved absolute environment file}"
: "${COMPOSE_FILE:?approved absolute Compose file}"
: "${PROJECT_DIRECTORY:?approved absolute project directory}"
: "${PROJECT_NAME:?approved explicit project name}"
: "${SERVICE:?approved Compose service}"
: "${APPROVED_PRODUCTION_IMAGE:?approved digest-qualified production image}"
: "${APPROVED_EXISTING_VOLUME:?approved existing production volume}"
: "${APPROVED_NORMAL_RESTART_POLICY:?approved normal restart policy}"
: "${APPROVED_CURRENT_CONTAINER_ID:?independently approved current container ID}"
: "${APPROVED_CURRENT_IMAGE_ID:?independently approved current image ID}"
: "${APPROVED_CURRENT_REVISION:?independently approved current intended git SHA}"
: "${APPROVED_NEW_IMAGE:?approved digest-qualified new image}"
: "${APPROVED_NEW_IMAGE_ID:?independently approved new image ID}"
: "${APPROVED_NEW_REVISION:?independently approved new intended git SHA}"
: "${APPROVED_PRIOR_IMAGE:?approved digest-qualified prior image}"
: "${APPROVED_PRIOR_IMAGE_ID:?independently approved prior image ID}"
: "${APPROVED_PRIOR_REVISION:?independently approved prior intended git SHA}"
: "${AUTO_UPDATERS_DISABLED:?recorded control-plane freeze approval}"
```

Observed values are evidence only. Never assign an observed container ID, image ID, endpoint, or OCI revision to an approved expected variable in the same command or without the recorded independent approval. In particular, `OBSERVED_CURRENT_REVISION` is compared with `APPROVED_CURRENT_REVISION`; it is never passed back as its own expectation.

Before reading the approved environment file, confirm it is an absolute canonical nonsymlink regular file owned by the recorded UID with mode `0600`, without printing its contents. Use the command matching the approved host:

```bash
test "$APPROVED_ENV_FILE" = "$(CDPATH= cd -- "$(dirname -- "$APPROVED_ENV_FILE")" && pwd -P)/$(basename -- "$APPROVED_ENV_FILE")"
test ! -L "$APPROVED_ENV_FILE" && test -f "$APPROVED_ENV_FILE"
test "$(stat -f '%u' -- "$APPROVED_ENV_FILE")" = "$EXPECTED_ENV_UID"
test "$(stat -f '%Lp' -- "$APPROVED_ENV_FILE")" = 600
```

On a reviewed GNU/Linux host, use `stat -c '%u'` and `stat -c '%a'` instead. Record only the owner ID and mode. Never print or checksum the environment file.

The following non-outputting check reads only the retirement key syntax. It never sources or prints the approved environment file. It accepts the key as absent or exactly one literal empty assignment and rejects whitespace variants, duplicates, and every nonempty value:

```bash
require_empty_retirement_env_file() {
  awk '
    BEGIN { seen = 0; valid = 1 }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*(export[[:space:]]+)?RETIRE_LEGACY_ACCOUNT_DATA([^A-Za-z0-9_]|$)/) {
        seen++
        if (line != "RETIRE_LEGACY_ACCOUNT_DATA=") valid = 0
      }
    }
    END { if (!valid || seen > 1) exit 1 }
  ' "$APPROVED_ENV_FILE" >/dev/null 2>&1
}

require_empty_retirement_env_file
```

Every production Compose command uses the global context before `compose`, the one approved absolute `--env-file`, absolute `-f` and `--project-directory`, and the explicit `--project-name`. Run config validation from a minimal environment with default environment-file discovery disabled. Pass the independently approved image, existing volume, and normal restart policy explicitly, but do not pass retirement here: the check above must examine the approved file rather than masking a persisted activation.

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_PRODUCTION_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY" \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" \
  --project-name "$PROJECT_NAME" \
  config --quiet
```

`config --quiet` is the only permitted Compose config form. Do not run outputting `compose config`, raw `docker inspect`, or an environment dump. Use only the filtered format queries shown here and in the identity guard. Do not use `compose run --no-build` or `compose create --no-deps`; those flag combinations are unsupported. The stopped-create path is exactly `compose up --no-start --no-deps --force-recreate --no-build --pull never SERVICE`.

Require the approved file's `SUBMISSIONS_PATH` decision to be `/data/submissions.db`; the stopped-container identity guard proves the effective value. The guard independently requires the environment file, Compose file, project directory, and Docker config to remain canonical, nonsymlinked, and identity-stable across its queries.

## Context, image, and current deployment identity

Record the selected context name and daemon endpoint with a narrow template, then compare the observation to independently approved values:

```bash
OBSERVED_CONTEXT_ENDPOINT="$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" context inspect \
  --format '{{.Name}}|{{.Endpoints.docker.Host}}' "$APPROVED_DOCKER_CONTEXT")"
test "$OBSERVED_CONTEXT_ENDPOINT" = "$APPROVED_DOCKER_CONTEXT|$APPROVED_DOCKER_HOST"
```

Resolve only the named service's full container ID. Record it, its immutable image ID, and the image revision through filtered queries. Compare the revision to the intended git SHA and the external provenance/attestation; a mutable tag is not evidence.

The release owner must build the immutable application image from the intended commit with Dockerfile build argument `VCS_REVISION` set to that full git SHA. The recorded OCI `org.opencontainers.image.revision` label, exact image ID, digest-qualified reference, and external provenance/attestation must all map back to the same SHA before this runbook begins. Image construction and publication are outside this database change and are not authorized by repository verification.

```bash
resolve_full_container_id() {
  local expected_project="$1"
  local independently_approved_container_id="$2"
  OBSERVED_CONTAINER_ID="$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
    docker --context "$APPROVED_DOCKER_CONTEXT" compose \
    --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
    --project-directory "$PROJECT_DIRECTORY" --project-name "$expected_project" \
    ps --all --quiet "$SERVICE")"
  test "$OBSERVED_CONTAINER_ID" = "$independently_approved_container_id"
}

resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"

OBSERVED_CURRENT_IMAGE_ID="$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" container inspect --format '{{.Image}}' "$APPROVED_CURRENT_CONTAINER_ID")"
test "$OBSERVED_CURRENT_IMAGE_ID" = "$APPROVED_CURRENT_IMAGE_ID"

OBSERVED_CURRENT_REVISION="$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" image inspect \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$APPROVED_CURRENT_IMAGE_ID")"
test "$OBSERVED_CURRENT_REVISION" = "$APPROVED_CURRENT_REVISION"
```

Production requires `APPROVED_EXISTING_VOLUME` to name an explicitly supplied volume that already exists and exactly matches the current approved container's `/data` named-volume mount. The Compose project-derived default is development-only. Verify existence before any `compose up`; a typo must not be allowed to auto-create an empty production volume.

```bash
test -n "$APPROVED_EXISTING_VOLUME"
test "$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" volume inspect --format '{{.Name}}' \
  "$APPROVED_EXISTING_VOLUME")" = "$APPROVED_EXISTING_VOLUME"
```

Use this literal guard function before and after mutations. Its arguments are independently approved expectations, never observations copied in the same step. It requires the exact context endpoint, canonical Docker config, Compose project/service/working-directory/config-file labels, resolved container ID, immutable image ID, approved revision/intended SHA, one exact `/data` named-volume mount, exact database path, a present nonempty secret boolean, retirement state, restart policy, state, and authorized phase. It enumerates every container attached to the volume and fails for an unknown, duplicate, malformed, or concurrently running consumer. It never renders the secret or complete environment.

```bash
verify_identity() {
  local expected_docker_host="$1"
  local expected_project="$2"
  local expected_container_id="$3"
  local expected_image_id="$4"
  local expected_revision="$5"
  local expected_volume="$6"
  local expected_restart="$7"
  local expected_retirement="$8"
  local expected_state="$9"
  local expected_phase="${10}"
  env -i PATH="$SAFE_PATH" HOME=/nonexistent \
    "$PROJECT_DIRECTORY/scripts/verify_deployment_identity.sh" \
    --docker-context "$APPROVED_DOCKER_CONTEXT" \
    --docker-host "$expected_docker_host" \
    --docker-config "$APPROVED_DOCKER_CONFIG" \
    --env-file "$APPROVED_ENV_FILE" \
    --compose-file "$COMPOSE_FILE" \
    --project-directory "$PROJECT_DIRECTORY" \
    --project-name "$expected_project" \
    --service "$SERVICE" \
    --container-id "$expected_container_id" \
    --image-id "$expected_image_id" \
    --revision "$expected_revision" \
    --volume "$expected_volume" \
    --restart-policy "$expected_restart" \
    --retirement-state "$expected_retirement" \
    --expected-state "$expected_state" \
    --phase "$expected_phase"
}

verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty running normal
```

Any failure stops the change. Do not substitute a guessed container, default volume, tag, path, or revision.

## Proxy and configuration gate

Record generic and Cloudflare proxy CIDRs separately; both repository defaults are empty. Identify the immediate network peer from authoritative deployment/network configuration, never from `X-Forwarded-For`, `CF-Connecting-IP`, or another request header. The proxy owner must run a controlled overwrite/sanitizer test proving that public spoofed forwarding and Cloudflare headers cannot change client identity, rate limiting, or analytics. Record the result without recording live client addresses.

Record only the `CLIENT_HASH_SECRET` custodian and rotation decision, never its value. Run `scripts/verify_compose.sh` locally and the production `config --quiet` command above. The identity guard must prove the effective secret is present/nonempty, the effective submissions path is exact, and retirement is empty before normal starts.

## Quiesce and encrypted backup

1. Drain and block traffic at the approved reverse-proxy route. Confirm the immediate peer and sanitizer evidence still match the record.
2. Confirm `AUTO_UPDATERS_DISABLED` and the Docker control-plane freeze remain valid.
3. Re-resolve and guard the current running container immediately before changing restart policy.

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty running normal
```

Change only that verified container's restart policy:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" container update \
  --restart no "$APPROVED_CURRENT_CONTAINER_ID" >/dev/null
```

Immediately re-resolve and guard the same running identity with restart disabled:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no empty running normal
```

Re-resolve and guard again immediately before the stop:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no empty running normal
```

Stop only the identity-verified service. Never use `down -v`:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_PRODUCTION_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  stop "$SERVICE"
```

Immediately re-resolve and guard the stopped identity:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no empty stopped normal
```

The backup owner must pre-verify a digest-pinned backup helper's exact image ID and tool version. With `umask 077`, stream the complete stopped volume, including the SQLite main file and any `-wal`, `-shm`, or `-journal` sidecar, through authenticated encryption into a timestamped artifact outside the repository and Docker build context. Mount the source volume read-only, use `--pull never`, and never create a plaintext backup artifact. A reviewed command has this shape:

```bash
test "$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" image inspect --format '{{.Id}}' "$BACKUP_IMAGE_DIGEST")" = "$BACKUP_IMAGE_ID"

env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=volume,src=$APPROVED_EXISTING_VOLUME,dst=/source,readonly" \
  "$BACKUP_IMAGE_DIGEST" /reviewed-backup-stream /source | \
  env -i PATH="$SAFE_PATH" age -r "$BACKUP_RECIPIENT" -o "$ENCRYPTED_ARCHIVE"
```

The exact helper entrypoint and encryption tool are owner-reviewed inputs, not repository facts. Record the encrypted artifact SHA-256, recipient/key ID, tool/version, owner, custody, location, access, retention, and deletion plan. Verify decryption to a disposable external target, then remove it. Confirm no plaintext archive remains.

## Disposable copied-fixture evidence

Restore/decrypt only into a new external disposable directory. The directory must be dedicated to this attempt, owned by a recorded nonzero `AUDIT_UID:AUDIT_GID`, and mode `0700`; copied files use the least owner-only modes. No authoritative volume, repository directory, encrypted archive, or source directory may be mounted into the reconciler container.

Copy the complete DB/WAL/SHM set from the untouched restore while it is quiescent. Use a deliberately different filename from `submissions.db`. If WAL and SHM are present, they must be copied as a pair. Before reconciliation, run exactly one of the following numeric ownership/mode checks for the reviewed host.

On BSD/macOS:

```bash
test "$AUDIT_UID" -ne 0 && test "$AUDIT_GID" -ne 0
test "$(stat -f '%u:%g:%Lp' -- "$RECONCILE_DIRECTORY")" = "$AUDIT_UID:$AUDIT_GID:700"
```

On GNU/Linux:

```bash
test "$AUDIT_UID" -ne 0 && test "$AUDIT_GID" -ne 0
test "$(stat -c '%u:%g:%a' -- "$RECONCILE_DIRECTORY")" = "$AUDIT_UID:$AUDIT_GID:700"
```

Only after the matching numeric check passes, reconcile that complete disposable working copy with the exact new application image and verified revision:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --user "$AUDIT_UID:$AUDIT_GID" \
  --mount "type=bind,src=$RECONCILE_DIRECTORY,dst=/fixture" \
  --entrypoint /app/submissions-reconcile \
  "$APPROVED_NEW_IMAGE" --confirm-disposable-copy /fixture/retirement-audit.sqlite3
```

### Mandatory cleanup-failure rule

If the reconciler returns its generic cleanup error, never audit, retry in place, or reuse that working directory. Discard the dedicated directory as a unit, recreate a fresh complete DB/WAL/SHM working copy from the untouched encrypted/archive restore, and rerun every initial path, ownership, link, identity, and sidecar guard. Do not attempt sidecar-by-sidecar repair and do not claim both transient sidecars survived: cleanup unlinks are sequential, so one may already be gone. The archive/source/authoritative volume must remain unmounted and untouched throughout.

After successful reconciliation, require no sidecars and change the single main copy to owner-read-only mode `0400`:

```bash
chmod 0400 "$RECONCILED_DATABASE"
```

Run exactly one matching numeric ownership/mode check. On BSD/macOS:

```bash
test "$(stat -f '%u:%g:%Lp' -- "$RECONCILED_DATABASE")" = "$AUDIT_UID:$AUDIT_GID:400"
```

On GNU/Linux:

```bash
test "$(stat -c '%u:%g:%a' -- "$RECONCILED_DATABASE")" = "$AUDIT_UID:$AUDIT_GID:400"
```

Only after the matching numeric check passes, mount that file read-only for canonical audit:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --user "$AUDIT_UID:$AUDIT_GID" \
  --mount "type=bind,src=$RECONCILED_DATABASE,dst=/fixture/retirement-audit.sqlite3,readonly" \
  --entrypoint /app/submissions-audit \
  "$APPROVED_NEW_IMAGE" /fixture/retirement-audit.sqlite3
```

Record the two canonical audit lines. With separately approved read-only, digest-pinned SQLite tooling against another copied fixture, record only: one `quick_check=ok`, zero `foreign_key_check` rows, schema/object/count/link inventory, account-table counts, `user_solutions` count, and non-null `submission_attempts.user_id` count. Never display row values. Any linked count or unapproved object/schema difference blocks activation. Record explicit account-data deletion approval and linked-data disposition, then securely delete the plaintext staging directory after evidence is accepted.

## Full confirmed rehearsal on a disposable restored volume

Before touching the authoritative volume, create an explicitly named disposable rehearsal volume, prove it empty with the verified helper, restore the complete archive, and verify numeric ownership/modes. Use an isolated explicit rehearsal project name. Reconcile and audit only a separate copied fixture; never run the reconciler on the rehearsal volume itself.

Prove the newly approved rehearsal project has no existing container; if one resolves, stop and independently identify it instead of overwriting it. Then create the rehearsal service stopped using the exact immutable new image, restart `no`, and the confirmed value only in this one command's minimal environment:

```bash
OBSERVED_REHEARSAL_EXISTING="$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$REHEARSAL_PROJECT_NAME" \
  ps --all --quiet "$SERVICE")"
test -z "$OBSERVED_REHEARSAL_EXISTING"
require_empty_retirement_env_file
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$REHEARSAL_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  RETIRE_LEGACY_ACCOUNT_DATA=confirmed \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$REHEARSAL_PROJECT_NAME" \
  up --no-start --no-deps --force-recreate --no-build --pull never "$SERVICE"
```

Resolve the full new ID as an observation, record it, and pause for independent approval as `APPROVED_REHEARSAL_CONTAINER_ID`. Then guard the created stopped service; do not derive the expectation in the guard call:

```bash
: "${APPROVED_REHEARSAL_CONTAINER_ID:?independently approved after stopped create}"
resolve_full_container_id "$REHEARSAL_PROJECT_NAME" "$APPROVED_REHEARSAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$REHEARSAL_PROJECT_NAME" \
  "$APPROVED_REHEARSAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$REHEARSAL_VOLUME" no confirmed stopped confirmed-prestart
```

Re-resolve and repeat the stopped confirmed guard immediately before the only rehearsal start:

```bash
resolve_full_container_id "$REHEARSAL_PROJECT_NAME" "$APPROVED_REHEARSAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$REHEARSAL_PROJECT_NAME" \
  "$APPROVED_REHEARSAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$REHEARSAL_VOLUME" no confirmed stopped confirmed-prestart
```

Start it once without another confirmed process override:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$REHEARSAL_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$REHEARSAL_PROJECT_NAME" \
  start "$SERVICE"
```

Immediately after start, re-resolve and use the only phase that authorizes a confirmed running assertion:

```bash
resolve_full_container_id "$REHEARSAL_PROJECT_NAME" "$APPROVED_REHEARSAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$REHEARSAL_PROJECT_NAME" \
  "$APPROVED_REHEARSAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$REHEARSAL_VOLUME" no confirmed running confirmed-post-start-verification
```

Wait only for the bounded direct health gate. Re-resolve and repeat that exact post-start guard immediately before stopping:

```bash
resolve_full_container_id "$REHEARSAL_PROJECT_NAME" "$APPROVED_REHEARSAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$REHEARSAL_PROJECT_NAME" \
  "$APPROVED_REHEARSAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$REHEARSAL_VOLUME" no confirmed running confirmed-post-start-verification
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$REHEARSAL_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$REHEARSAL_PROJECT_NAME" \
  stop "$SERVICE"
```

Immediately re-resolve and require the confirmed container to be stopped again:

```bash
resolve_full_container_id "$REHEARSAL_PROJECT_NAME" "$APPROVED_REHEARSAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$REHEARSAL_PROJECT_NAME" \
  "$APPROVED_REHEARSAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$REHEARSAL_VOLUME" no confirmed stopped confirmed-prestart
```

A linked-data refusal, unsupported schema, crash, timeout, or discrepancy blocks production; do not loop or retry blindly. With the rehearsal stopped, take a new complete copied fixture, reconcile sidecars only in its dedicated disposable directory, and require unchanged canonical submission evidence, current schema, no retired objects, one `quick_check=ok`, zero foreign-key violations, and no sidecars. Preserve the authoritative volume stopped and unchanged.

## One-shot authoritative maintenance

Reconfirm proxy drain, owner approvals, control-plane freeze, encrypted archive evidence, rehearsal evidence, exact digest-qualified new/prior image references, image IDs, independently approved OCI revisions, and provenance mapping the new revision to the intended git SHA. Immediately before recreation, re-resolve and guard the current stopped identity and explicit authoritative volume:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CURRENT_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CURRENT_CONTAINER_ID" "$APPROVED_CURRENT_IMAGE_ID" "$APPROVED_CURRENT_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no empty stopped normal
require_empty_retirement_env_file
```

Create the service stopped with the new image and same authoritative volume. Retirement activation exists only in this command environment; never put it in the approved environment file, shell profile, Compose defaults, or repository:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  RETIRE_LEGACY_ACCOUNT_DATA=confirmed \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  up --no-start --no-deps --force-recreate --no-build --pull never "$SERVICE"
```

Resolve the new ID as an observation, record it, and pause for independent approval as `APPROVED_CONFIRMED_CONTAINER_ID`. Then guard the new stopped identity:

```bash
: "${APPROVED_CONFIRMED_CONTAINER_ID:?independently approved after stopped create}"
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed stopped confirmed-prestart
```

Re-resolve and repeat the stopped confirmed guard immediately before the sole confirmed start:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed stopped confirmed-prestart
```

Only then start:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  start "$SERVICE"
```

Immediately re-resolve and guard the running confirmed phase:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed running confirmed-post-start-verification
```

Wait for the bounded startup/direct-health gate. Re-resolve and repeat the post-start guard immediately before stop:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed running confirmed-post-start-verification
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  stop "$SERVICE"
```

Immediately re-resolve and guard the stopped confirmed identity:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed stopped confirmed-prestart
```

This was the only start while activation was confirmed. Expected linked/unsupported refusal is a stop condition: prove canonical copied-fixture evidence unchanged and do not retry blindly.

On success, keep traffic drained. Take a fresh complete copied fixture and require the original submission count/digest, one `quick_check=ok`, zero foreign-key violations, expected current schema, no retired objects, and no sidecars.

Immediately before normal recreation, repeat the stopped confirmed guard above. Confirm the approved environment file still has empty/absent retirement, then recreate stopped with activation absent and the approved normal restart policy:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_CONFIRMED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_CONFIRMED_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" no confirmed stopped confirmed-prestart
require_empty_retirement_env_file
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY" \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  up --no-start --no-deps --force-recreate --no-build --pull never "$SERVICE"
```

Resolve the new normal ID as an observation, record it, and pause for independent approval as `APPROVED_NORMAL_CONTAINER_ID`. Guard it immediately after recreation and again immediately before start:

```bash
: "${APPROVED_NORMAL_CONTAINER_ID:?independently approved after normal stopped create}"
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_NORMAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_NORMAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty stopped normal

resolve_full_container_id "$PROJECT_NAME" "$APPROVED_NORMAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_NORMAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty stopped normal
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_NEW_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME" \
  CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY" \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  start "$SERVICE"
```

Immediately re-resolve and guard normal running state:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_NORMAL_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_NORMAL_CONTAINER_ID" "$APPROVED_NEW_IMAGE_ID" "$APPROVED_NEW_REVISION" \
  "$APPROVED_EXISTING_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty running normal
```

## Pre-write rollback

The recorded rollback trigger applies to any migration/start/evidence/direct-health failure and any failure during the read-only canary below, including after the normal service has started. Before rollback, re-drain traffic, block submission POSTs and every other storage write, and obtain independent approval of that evidence. Preserve the failed volume. Never remove, rename, empty, restore over, or mount the failed volume read-write. Rollback is the only intentional new-volume path.

At rollback entry, independently approve the exact digest-qualified failed image reference plus the actual container ID, image ID, revision, volume, restart policy, retirement state, run state, and valid identity-guard phase. Also approve the expected phase after the service is stopped; its restart policy is always literal `no`. An empty retirement state requires phase `normal`; a confirmed running state requires `confirmed-post-start-verification`; and a confirmed stopped state requires `confirmed-prestart`. These are approved expectations, never values derived inside a guard call.

```bash
: "${APPROVED_ROLLBACK_TRAFFIC_REDRAINED:?independently approved proxy re-drain evidence}"
: "${APPROVED_ROLLBACK_WRITES_BLOCKED:?independently approved write-block evidence}"
test "$APPROVED_ROLLBACK_TRAFFIC_REDRAINED" = yes
test "$APPROVED_ROLLBACK_WRITES_BLOCKED" = yes

: "${APPROVED_FAILED_IMAGE:?independently approved digest-qualified failed image reference}"
: "${APPROVED_FAILED_CONTAINER_ID:?independently approved actual container ID}"
: "${APPROVED_FAILED_IMAGE_ID:?independently approved actual image ID}"
: "${APPROVED_FAILED_REVISION:?independently approved actual revision}"
: "${APPROVED_FAILED_VOLUME:?independently approved actual failed volume}"
: "${APPROVED_FAILED_RESTART:?independently approved actual restart policy}"
: "${APPROVED_FAILED_RETIREMENT:?independently approved actual retirement state}"
: "${APPROVED_FAILED_STATE:?independently approved actual run state}"
: "${APPROVED_FAILED_PHASE:?independently approved actual guard phase}"
: "${APPROVED_FAILED_STOPPED_PHASE:?independently approved stopped guard phase}"

case "$APPROVED_FAILED_RETIREMENT:$APPROVED_FAILED_STATE:$APPROVED_FAILED_PHASE" in
  empty:running:normal|empty:stopped:normal|confirmed:running:confirmed-post-start-verification|confirmed:stopped:confirmed-prestart) ;;
  *) exit 1 ;;
esac
case "$APPROVED_FAILED_RETIREMENT:$APPROVED_FAILED_STOPPED_PHASE" in
  empty:normal|confirmed:confirmed-prestart) ;;
  *) exit 1 ;;
esac
```

Before branch selection, resolve and guard the exact independently approved actual state and restart policy:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" "$APPROVED_FAILED_RESTART" \
  "$APPROVED_FAILED_RETIREMENT" "$APPROVED_FAILED_STATE" "$APPROVED_FAILED_PHASE"
```

Normalize only that exact guarded container to restart `no`, regardless of whether the independently approved actual state is running or stopped:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" container update --restart no "$APPROVED_FAILED_CONTAINER_ID" >/dev/null
```

Immediately re-resolve and guard the same independently approved state with restart `no`:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" "$APPROVED_FAILED_STATE" "$APPROVED_FAILED_PHASE"
```

The change-record owner selects exactly one branch below from `APPROVED_FAILED_STATE`. No observed output selects a rollback branch. Do not probe and branch automatically.

### Failed service already stopped

If the independently approved actual state is `stopped`, require its approved stopped phase and repeat the stopped/restart-`no` guard. Only this guard authorizes skipping the stop command:

```bash
test "$APPROVED_FAILED_STATE" = stopped
test "$APPROVED_FAILED_STOPPED_PHASE" = "$APPROVED_FAILED_PHASE"
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" stopped "$APPROVED_FAILED_STOPPED_PHASE"
```

### Failed service still running

If the independently approved actual state is `running`, repeat the running/restart-`no` guard immediately before the explicit stop:

```bash
test "$APPROVED_FAILED_STATE" = running
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" running "$APPROVED_FAILED_PHASE"
```

Stop with the full approved endpoint and project selectors, the command-scoped failed image and volume, restart `no`, and no retirement activation override:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_FAILED_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_FAILED_VOLUME" \
  CRACKLEDATE_RESTART_POLICY=no \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  stop "$SERVICE"
```

After the approved branch, resolve and guard the exact stopped identity again. This common convergence guard is mandatory before any restore, replacement-volume creation, copy, or replacement recreation:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" stopped "$APPROVED_FAILED_STOPPED_PHASE"
```

1. Create an explicitly named replacement volume and require its exact name.
2. Mount it read-only into the verified helper and prove it is empty. Never restore over a populated volume; absent backup files or sidecars could otherwise survive. Emptying/recreating the authoritative volume instead requires separate owner approval.
3. Verify/decrypt the complete archive into a disposable restore, reconcile and fully verify only a copied fixture, and never mount the replacement/future-authoritative volume into the state-changing reconciler.
4. Copy the verified reconciled main DB with no sidecars into the empty replacement using recorded numeric ownership/modes.
5. Before any app opens it, take a fresh read-only copied fixture back out and require the pre-maintenance count/digest, exact pre-maintenance historical schema/object inventory when retirement applied, one `quick_check=ok`, zero foreign-key violations, no sidecars, and exact numeric ownership/modes. Partial, truncated, mis-owned, or normalized-by-app data blocks start.

```bash
test "$(env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" volume create "$ROLLBACK_VOLUME")" = "$ROLLBACK_VOLUME"

env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=volume,src=$ROLLBACK_VOLUME,dst=/target,readonly" \
  "$BACKUP_IMAGE_DIGEST" /reviewed-require-empty /target
```

Only after the read-only emptiness proof and disposable-restore evidence pass may the separately reviewed copy step mount the future-authoritative volume read-write. Re-resolve and repeat the stopped failed-service guard immediately before that copy. It mounts only the verified reconciled main database as read-only input and writes the recorded numeric owner/mode; no other pre-attach helper may mount this volume read-write:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" stopped "$APPROVED_FAILED_STOPPED_PHASE"
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$VERIFIED_RECONCILED_DATABASE,dst=/input/submissions.db,readonly" \
  --mount "type=volume,src=$ROLLBACK_VOLUME,dst=/target" \
  "$BACKUP_IMAGE_DIGEST" /reviewed-copy-verified-main \
  /input/submissions.db /target/submissions.db "$RESTORED_UID" "$RESTORED_GID" "$RESTORED_MODE"
```

After copying, remount the rollback volume read-only to take the fresh fixture and complete every pre-maintenance evidence/ownership check. Before replacing the failed stopped service, re-resolve its full ID and repeat the approved stopped guard:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_FAILED_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_FAILED_CONTAINER_ID" "$APPROVED_FAILED_IMAGE_ID" "$APPROVED_FAILED_REVISION" \
  "$APPROVED_FAILED_VOLUME" no \
  "$APPROVED_FAILED_RETIREMENT" stopped "$APPROVED_FAILED_STOPPED_PHASE"
require_empty_retirement_env_file
```

Create the prior service stopped with the explicit replacement volume, prior immutable image, normal restart policy, and no activation:

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_PRIOR_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$ROLLBACK_VOLUME" \
  CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY" \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  up --no-start --no-deps --force-recreate --no-build --pull never "$SERVICE"
```

Resolve the new prior container ID as an observation, record it, and pause for independent approval as `APPROVED_ROLLBACK_CONTAINER_ID`. Guard it after recreation and again immediately before start:

```bash
: "${APPROVED_ROLLBACK_CONTAINER_ID:?independently approved after rollback stopped create}"
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_ROLLBACK_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_ROLLBACK_CONTAINER_ID" "$APPROVED_PRIOR_IMAGE_ID" "$APPROVED_PRIOR_REVISION" \
  "$ROLLBACK_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty stopped normal

resolve_full_container_id "$PROJECT_NAME" "$APPROVED_ROLLBACK_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_ROLLBACK_CONTAINER_ID" "$APPROVED_PRIOR_IMAGE_ID" "$APPROVED_PRIOR_REVISION" \
  "$ROLLBACK_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty stopped normal
```

```bash
env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" COMPOSE_DISABLE_ENV_FILE=1 \
  CRACKLEDATE_IMAGE="$APPROVED_PRIOR_IMAGE" \
  CRACKLEDATE_SUBMISSIONS_VOLUME="$ROLLBACK_VOLUME" \
  CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY" \
  docker --context "$APPROVED_DOCKER_CONTEXT" compose \
  --env-file "$APPROVED_ENV_FILE" -f "$COMPOSE_FILE" \
  --project-directory "$PROJECT_DIRECTORY" --project-name "$PROJECT_NAME" \
  start "$SERVICE"
```

Immediately re-resolve and guard the prior app as running before bounded direct health and smoke checks:

```bash
resolve_full_container_id "$PROJECT_NAME" "$APPROVED_ROLLBACK_CONTAINER_ID"
verify_identity "$APPROVED_DOCKER_HOST" "$PROJECT_NAME" \
  "$APPROVED_ROLLBACK_CONTAINER_ID" "$APPROVED_PRIOR_IMAGE_ID" "$APPROVED_PRIOR_REVISION" \
  "$ROLLBACK_VOLUME" "$APPROVED_NORMAL_RESTART_POLICY" empty running normal
```

Never use `down -v`.

## Canary, write enable, and post-write failure

On both the successful forward path and pre-write rollback, keep all traffic drained until bounded direct health and non-mutating static, puzzle, and hint smoke checks pass. Do not create a synthetic production submission. Permit a bounded public canary only while the proxy still blocks submission POSTs and all other storage writes. Prove a controlled POST is rejected at the proxy and cannot reach the app; monitor health plus only filtered, redacted error logs under the recorded archive-rollback trigger.

Enable submission writes only after the canary passes and the recorded cutover owner explicitly approves. Mark that instant in the change record. From then on, blind restore of the pre-maintenance archive is forbidden because it can discard newly accepted rows.

A post-write failure must immediately block writes and re-drain traffic, preserve and encrypt the current failed volume, capture current canonical evidence, and use the owner-approved forward repair or lossless delta-merge/recovery plan. Restoring the old archive after writes requires explicit documented data-loss approval when lossless recovery is impossible; it is never described as automatic rollback.

## Deferred VACUUM and cookie compatibility

`VACUUM` is never part of startup, retirement, rollback, or this automated workflow. It is offline-only after a separate encrypted backup, free-space estimate, maintenance approval, and copied-fixture verification.

Record the shipping release that retains the legacy-cookie expiry middleware, the planned removal release/window, and its owner. Do not remove compatibility middleware merely because the account tables were retired; browser cookie cleanup and database retirement have separate release criteria.
