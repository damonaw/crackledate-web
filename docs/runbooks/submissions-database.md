# Stateless submissions-data decommission runbook

> This is a separately authorized production procedure. It is not a repository check and does not authorize any production command by itself. Missing, changed, or ambiguous evidence stops the operation. Do not infer a context, endpoint, configuration, project, service, container, image, volume, proxy, owner, or window from defaults.

Never run `docker compose down -v`.

This procedure preserves no gameplay content. Do not open a database, query a row, copy database contents, or create a preservation artifact. Do not use wildcards, `docker system prune`, `docker volume prune`, or a force flag. The only destructive action is one explicitly named `docker volume rm` command after fresh confirmation.

## Required external evidence

Before any production action, an independently approved external record must contain all of the following. It is owner-only, outside Git, and contains no gameplay content.

| Evidence | Required record |
| --- | --- |
| Docker target | Exact Docker context and daemon endpoint |
| Docker configuration | Canonical absolute Docker config directory |
| Legacy runtime | Explicit project, service, and former full container ID |
| Legacy release | Current immutable image ID and OCI revision |
| Target | Exact existing submissions-volume name |
| Inspection | Digest-qualified inspection image |
| Proxy | Reverse-proxy owner plus reviewed host/proxy configuration evidence |
| Deployment | Named deploy owner and immutable stateless image/revision |
| Window | Approved maintenance window |
| Fingerprint storage | Canonical owner-only directory (mode `0700`) and a new canonical fingerprint path (mode `0600` after capture) |

The record supplies `SAFE_PATH` as the fixed literal `/usr/local/bin:/usr/bin:/bin`, not a value inherited from the invoking shell. It also supplies the following independently approved values: `APPROVED_DOCKER_CONTEXT`, `APPROVED_DOCKER_HOST`, `APPROVED_DOCKER_CONFIG`, `APPROVED_PROJECT_DIRECTORY`, `PROJECT_NAME`, `SERVICE`, `APPROVED_CURRENT_CONTAINER_ID`, `APPROVED_CURRENT_IMAGE_ID`, `APPROVED_CURRENT_REVISION`, `APPROVED_EXISTING_VOLUME`, `APPROVED_FINGERPRINT_FILE`, and `APPROVED_INSPECTION_IMAGE`.

Confirm the fingerprint parent is canonical, nonsymlinked, owned by the operator, and mode `0700` before capture. The capture guard rejects a path outside such a directory and publishes only a new owner-only regular file with mode `0600`; do not reuse, edit, symlink, or relocate it. All examples use a minimal environment and `/usr/bin/env` by absolute path. Do not run a command with the inherited environment.

## Capture

Start a non-logging shell and take each value from the independently approved external record. Never fill an expected value from an observation made by the same command.

```bash
set -euo pipefail
set +x
set +o history 2>/dev/null || true
umask 077

SAFE_PATH='/usr/local/bin:/usr/bin:/bin'

/usr/bin/env -i PATH="$SAFE_PATH" HOME=/nonexistent \
  "$APPROVED_PROJECT_DIRECTORY/scripts/capture_submissions_volume_identity.sh" \
  --docker-context "$APPROVED_DOCKER_CONTEXT" \
  --docker-host "$APPROVED_DOCKER_HOST" \
  --docker-config "$APPROVED_DOCKER_CONFIG" \
  --project-name "$PROJECT_NAME" \
  --service "$SERVICE" \
  --container-id "$APPROVED_CURRENT_CONTAINER_ID" \
  --volume "$APPROVED_EXISTING_VOLUME" \
  --output "$APPROVED_FINGERPRINT_FILE"
```

The successful capture is metadata-only evidence for the exact former `/data` mount. Stop if it does not succeed, if any approved identity differs, or if the fingerprint path cannot meet the owner-only contract.

## Deploy stateless service

The deploy owner must use the separately reviewed web stateless release plan to remove `/data`, the submissions volume, `SUBMISSIONS_PATH`, and the submission service from the runtime, then deploy the recorded immutable image and revision. The legacy volume must not be attached to the stateless service.

Do not delete a volume in this phase. Stop if the deployed service identity is not the approved immutable image and revision, any `/data` destination or volume mount remains, or a stateless runtime configuration is not proven.

## Verify runtime and logs

Run the approved public canaries against the approved endpoint. Health, a static asset, the current puzzle, evaluation, validation, and POST hint must succeed. GET hint must be unavailable. Every submission method (GET, POST, PUT, PATCH, and DELETE) must be unavailable.

Repeat normal play and hint requests. The deploy owner must prove from filtered runtime evidence that they create no Docker volume, file, or database. A failure or unexpected retained state stops the operation.

Obtain an application-log sample that proves each emitted record has exactly these keys: `timestamp`, `level`, `method`, `path`, `status`, and `durationMs`. The reverse-proxy/host configuration owner must review the active configuration and prove retained access logs omit the query string, request body, response body, address, address hash, country, ray ID, user agent, and referrer. If the deployed proxy cannot meet this contract, stop before publishing the aligned privacy statement.

After the stateless runtime and logging gates pass, use the detached-volume guard with the same approved external values:

```bash
/usr/bin/env -i PATH="$SAFE_PATH" HOME=/nonexistent \
  "$APPROVED_PROJECT_DIRECTORY/scripts/verify_detached_submission_volume.sh" \
  --docker-context "$APPROVED_DOCKER_CONTEXT" \
  --docker-host "$APPROVED_DOCKER_HOST" \
  --docker-config "$APPROVED_DOCKER_CONFIG" \
  --fingerprint "$APPROVED_FINGERPRINT_FILE" \
  --inspection-image "$APPROVED_INSPECTION_IMAGE"
```

The verifier must print exactly `detached submissions volume verified: $APPROVED_EXISTING_VOLUME` and prove the volume is detached before and after its metadata-only inspection. Do not continue on any other output or exit status.

## Confirm exact deletion

Only after the detached verifier succeeds, paste the verified target to the user and ask exactly:

`Delete this exact detached CrackleDate submissions volume permanently, with no backup: <context> <endpoint> <volume>?`

Only an affirmative response received after that successful verifier run, naming the same context, endpoint, and volume, authorizes the next command. A generic, stale, or mismatched approval stops the procedure.

Immediately rerun the detached verifier command above. Then execute this one non-force removal command and require its stdout to equal exactly `$APPROVED_EXISTING_VOLUME`:

```bash
/usr/bin/env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" volume rm "$APPROVED_EXISTING_VOLUME"
```

Do not use `-f`.

## Verify deletion

Prove the exact named volume no longer exists:

```bash
if /usr/bin/env -i PATH="$SAFE_PATH" DOCKER_CONFIG="$APPROVED_DOCKER_CONFIG" \
  docker --context "$APPROVED_DOCKER_CONTEXT" volume inspect \
  "$APPROVED_EXISTING_VOLUME" >/dev/null 2>&1; then
  printf 'deleted volume still exists\n' >&2
  exit 1
fi
```

Repeat every stateless service canary and prove no submissions volume was recreated. Record only command exit status, service/image/revision identity, deletion timestamp, and successful canary results. Never record gameplay rows.
