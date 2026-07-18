#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-volume-verify-test.XXXXXX")"
scratch="$(CDPATH= cd -- "$scratch" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

verify_script="$repo_dir/scripts/verify_detached_submission_volume.sh"
if [[ ! -f "$verify_script" ]]; then
  printf 'verify_detached_submission_volume.sh is missing\n' >&2
  exit 1
fi

runbook="$repo_dir/docs/runbooks/submissions-database.md"
if [[ ! -f "$runbook" ]]; then
  printf 'submissions decommission runbook is missing\n' >&2
  exit 1
fi

readme="$repo_dir/README.md"
if [[ ! -f "$readme" ]]; then
  printf 'README is missing\n' >&2
  exit 1
fi

assert_runbook_convention() {
  local previous=0 phase line
  for phase in \
    'Capture' \
    'Deploy stateless service' \
    'Verify runtime and logs' \
    'Confirm exact deletion' \
    'Verify deletion'; do
    line="$(grep -n -F "## $phase" "$runbook" | head -n 1 | cut -d: -f1 || true)"
    [[ "$line" =~ ^[0-9]+$ && "$line" -gt "$previous" ]] || {
      printf 'runbook phase is missing or out of order: %s\n' "$phase" >&2
      exit 1
    }
    previous="$line"
  done

  grep -Fqx 'Never run `docker compose down -v`.' "$runbook" || {
    printf 'runbook lacks the docker compose down -v prohibition\n' >&2
    exit 1
  }

  grep -Fq '`detached submissions volume verified: $APPROVED_EXISTING_VOLUME`' "$runbook" || {
    printf 'runbook lacks the verifier exact success line\n' >&2
    exit 1
  }

  if grep -E -i '(backup|export|row query)' "$runbook" | \
    grep -Fvx '`Delete this exact detached CrackleDate submissions volume permanently, with no backup: <context> <endpoint> <volume>?`' >/dev/null || \
    grep -E -i \
      'encrypted archive|plaintext archive|restore/decrypt|reconciler|submissions-audit|submissions-reconcile|sqlite3|SELECT[[:space:]]|automatic.*(delete|deletion)|startup.*(delete|deletion)' \
      "$runbook" >/dev/null; then
    printf 'runbook contains a forbidden preservation, row-query, or automatic-deletion instruction\n' >&2
    exit 1
  fi
}

assert_runbook_convention

assert_cutover_status_copy() {
  grep -Fq 'After the stateless cutover is deployed and verified' "$readme" || {
    printf 'README does not mark stateless behavior as post-cutover\n' >&2
    exit 1
  }

  if grep -Fq 'RETIRE_LEGACY_ACCOUNT_DATA' "$readme" || \
    grep -Fq 'The stateless production service does not retain submitted gameplay.' "$readme" || \
    grep -Fq '/api/submissions` is unavailable in the stateless release.' "$readme" || \
    grep -Fq 'submission, validation, and evaluation routes' "$readme"; then
    printf 'README contains stale retirement, current-stateless, or contradictory submission-rate-limit copy\n' >&2
    exit 1
  fi
}

assert_cutover_status_copy

inspection_id='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
consumer_id='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
inspection_image="registry.example/crackledate-inspector@sha256:$(printf 'e%.0s' {1..64})"

write_state() {
  local subject="$1"
  local key="$2"
  shift 2
  printf '%s\n' "$@" >"$subject/state/$key"
}

write_fingerprint() {
  local subject="$1"
  cat >"$subject/artifact/fingerprint" <<EOF
fingerprint_version=1
docker_context=approved-context
docker_host=unix:///approved/docker.sock
project_name=approved-project
service=crackledate-site
former_container_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
former_mount_destination=/data
volume_name=approved-volume
volume_driver=local
volume_scope=local
volume_mountpoint=/var/lib/docker/volumes/approved-volume/_data
volume_created_at=2026-07-18T12:34:56Z
volume_label_count=4
volume_label_000=alpha=first
volume_label_001=com.docker.compose.project=approved-project
volume_label_002=com.docker.compose.volume=submissions
volume_label_003=zeta=last
EOF
  chmod 600 "$subject/artifact/fingerprint"
}

new_subject() {
  local name="$1"
  local subject="$scratch/$name"
  mkdir -p "$subject/scripts" "$subject/bin" "$subject/hostile-bin" "$subject/home" \
    "$subject/state" "$subject/docker-config" "$subject/inherited-docker-config" "$subject/artifact"
  chmod 700 "$subject/artifact"
  cp "$verify_script" "$subject/scripts/verify_detached_submission_volume.sh"
  chmod +x "$subject/scripts/verify_detached_submission_volume.sh"

  grep -Fqx 'safe_path="/usr/local/bin:/usr/bin:/bin"' "$verify_script" || {
    printf 'verifier does not use the fixed production PATH\n' >&2
    exit 1
  }
  grep -Fq '/usr/bin/env -i' "$verify_script" || {
    printf 'verifier does not invoke env by trusted absolute path\n' >&2
    exit 1
  }
  for required in \
    '--network none' \
    '--read-only' \
    '--cap-drop ALL' \
    '--security-opt no-new-privileges' \
    'type=volume,src=$volume_name,dst=/evidence,readonly'; do
    grep -F -- "$required" "$verify_script" >/dev/null || {
      printf 'verifier lacks required inspection constraint: %s\n' "$required" >&2
      exit 1
    }
  done
  if grep -E -- '(^|[[:space:]])(sqlite3|cat|head|tail|strings|cp|tar|dd|md5|md5sum|sha1sum|sha256sum|shasum)([[:space:]]|$)' \
    "$verify_script" >/dev/null; then
    printf 'verifier contains a forbidden content-reading command\n' >&2
    exit 1
  fi

  sed -i.bak "s|safe_path=\"/usr/local/bin:/usr/bin:/bin\"|safe_path=\"$subject/bin:/usr/local/bin:/usr/bin:/bin\"|" \
    "$subject/scripts/verify_detached_submission_volume.sh"
  rm -f "$subject/scripts/verify_detached_submission_volume.sh.bak"

  cat >"$subject/hostile-bin/docker" <<'HOSTILE_DOCKER'
#!/usr/bin/env bash
printf 'verifier used inherited PATH Docker\n' >&2
exit 111
HOSTILE_DOCKER
  chmod +x "$subject/hostile-bin/docker"
  cat >"$subject/hostile-bin/env" <<'HOSTILE_ENV'
#!/usr/bin/env bash
printf 'verifier used inherited PATH env\n' >&2
exit 112
HOSTILE_ENV
  chmod +x "$subject/hostile-bin/env"

  write_fingerprint "$subject"
  write_state "$subject" context 'approved-context'
  write_state "$subject" context_identity 'approved-context|unix:///approved/docker.sock'
  write_state "$subject" volume_target 'approved-volume'
  write_state "$subject" volume_name 'approved-volume'
  write_state "$subject" volume_driver 'local'
  write_state "$subject" volume_scope 'local'
  write_state "$subject" volume_mountpoint '/var/lib/docker/volumes/approved-volume/_data'
  write_state "$subject" volume_created_at '2026-07-18T12:34:56Z'
  write_state "$subject" volume_label_count '4'
  write_state "$subject" volume_label_keys \
    'alpha' \
    'com.docker.compose.project' \
    'com.docker.compose.volume' \
    'zeta'
  write_state "$subject" volume_label_alpha 'first'
  write_state "$subject" volume_label_com.docker.compose.project 'approved-project'
  write_state "$subject" volume_label_com.docker.compose.volume 'submissions'
  write_state "$subject" volume_label_zeta 'last'
  write_state "$subject" inspection_metadata \
    '/evidence/submissions.db|regular file|1' \
    '/evidence/submissions.db-journal|regular file|1' \
    '/evidence/submissions.db-shm|regular file|1' \
    '/evidence/submissions.db-wal|regular file|1'
  write_state "$subject" inspection_exit '0'

  cat >"$subject/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail

bin_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
subject="$(CDPATH= cd -- "$bin_dir/.." && pwd -P)"
state="$subject/state"

{
  for argument in "$@"; do
    printf '%q ' "$argument"
  done
  printf '\n'
} >>"$subject/docker-calls.log"

if [[ ${VERIFY_LEAK_SENTINEL+x} == x || ${CLIENT_HASH_SECRET+x} == x ]]; then
  printf 'verifier leaked inherited environment to Docker\n' >&2
  exit 90
fi
if [[ ${DOCKER_CONFIG:-} != "$subject/docker-config" || ${LC_ALL:-} != C ]]; then
  printf 'verifier omitted the approved Docker config or C locale\n' >&2
  exit 91
fi
context="$(<"$state/context")"
if [[ ${1:-} != '--context' || ${2:-} != "$context" ]]; then
  printf 'verifier omitted the explicit Docker context\n' >&2
  exit 92
fi
shift 2

emit() {
  local key="$1"
  local line=''
  [[ -f "$state/$key" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line"
  done <"$state/$key"
}

emit_println() {
  emit "$1"
  printf '\n'
  if [[ -f "$state/println_unterminated_suffix" ]]; then
    printf '%s' "$(<"$state/println_unterminated_suffix")"
  fi
}

require_removed_for_post_query() {
  if [[ -f "$state/created" && ! -f "$state/removed" ]]; then
    printf 'post-inspection query occurred before removal\n' >&2
    exit 93
  fi
}

case "${1:-} ${2:-}" in
  'context inspect')
    require_removed_for_post_query
    [[ ${3:-} == '--format' && ${4:-} == '{{.Name}}|{{.Endpoints.docker.Host}}' && \
      ${5:-} == "$context" && $# -eq 5 ]] || exit 94
    emit context_identity
    ;;
  'volume inspect')
    require_removed_for_post_query
    [[ ${3:-} == '--format' && $# -eq 5 && ${5:-} == "$(<"$state/volume_target")" ]] || exit 95
    if [[ -f "$state/removed" && -f "$state/disappearing" ]]; then
      exit 96
    fi
    case "$4" in
      '{{.Name}}') emit volume_name ;;
      '{{.Driver}}') emit volume_driver ;;
      '{{.Scope}}') emit volume_scope ;;
      '{{.Mountpoint}}') emit volume_mountpoint ;;
      '{{.CreatedAt}}') emit volume_created_at ;;
      '{{len .Labels}}') emit volume_label_count ;;
      '{{range $key, $_ := .Labels}}{{printf "%s" $key}}{{println}}{{end}}') emit_println volume_label_keys ;;
      *)
        if [[ "$4" =~ ^\{\{index\ \.Labels\ \"([A-Za-z0-9_.-]+)\"\}\}$ ]]; then
          emit "volume_label_${BASH_REMATCH[1]}"
        else
          exit 97
        fi
        ;;
    esac
    ;;
  'container ls')
    [[ ${3:-} == '--all' && ${4:-} == '--filter' && \
      ${5:-} == "volume=$(<"$state/volume_target")" && ${6:-} == '--quiet' && $# -eq 6 ]] || exit 98
    if [[ ! -f "$state/created" ]]; then
      : >"$state/pre-consumer-checked"
      [[ ! -f "$state/current_consumer" ]] || emit current_consumer
    else
      [[ -f "$state/removed" ]] || exit 99
      : >"$state/post-consumer-checked"
      [[ ! -f "$state/post_consumer" ]] || emit post_consumer
    fi
    ;;
  'container create')
    [[ -f "$state/pre-consumer-checked" && ! -f "$state/created" ]] || exit 100
    expected_mount="type=volume,src=$(<"$state/volume_target"),dst=/evidence,readonly"
    [[ $# -eq 26 && ${3:-} == '--name' && ${4:-} == crackledate-volume-inspect-* && \
      ${5:-} == '--network' && ${6:-} == none && ${7:-} == '--read-only' && \
      ${8:-} == '--cap-drop' && ${9:-} == ALL && ${10:-} == '--security-opt' && \
      ${11:-} == no-new-privileges && ${12:-} == '--mount' && ${13:-} == "$expected_mount" && \
      ${14:-} == *@sha256:* && ${15:-} == find && ${16:-} == /evidence && \
      ${17:-} == -mindepth && ${18:-} == 1 && ${19:-} == -maxdepth && ${20:-} == 1 && \
      ${21:-} == -exec && ${22:-} == stat && ${23:-} == '-c' && \
      ${24:-} == '%n|%F|%h' && ${25:-} == '{}' && ${26:-} == + ]] || exit 101
    if [[ -f "$state/create_fail" ]]; then
      printf 'secret-must-not-reach-docker\n' >&2
      exit 108
    fi
    : >"$state/created"
    printf '%s\n' 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    ;;
  'container start')
    [[ -f "$state/created" && ! -f "$state/started" && $# -eq 3 && \
      ${3:-} == cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ]] || exit 102
    : >"$state/started"
    printf '%s\n' "$3"
    ;;
  'container wait')
    [[ -f "$state/started" && ! -f "$state/waited" && $# -eq 3 && \
      ${3:-} == cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ]] || exit 103
    : >"$state/waited"
    emit inspection_exit
    ;;
  'container logs')
    [[ -f "$state/waited" && ! -f "$state/logged" && $# -eq 3 && \
      ${3:-} == cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ]] || exit 104
    : >"$state/logged"
    emit inspection_metadata
    ;;
  'container rm')
    [[ -f "$state/created" && ! -f "$state/removed" && $# -eq 4 && \
      ${3:-} == '--force' && ${4:-} == cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ]] || exit 105
    [[ ! -f "$state/remove_fail" ]] || exit 106
    : >"$state/removed"
    printf '%s\n' "$4"
    ;;
  *)
    printf 'unsafe or malformed Docker command\n' >&2
    exit 107
    ;;
esac
FAKE_DOCKER
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

verify_args=()

build_verify_args() {
  local subject="$1"
  verify_args=(
    --docker-context approved-context
    --docker-host unix:///approved/docker.sock
    --docker-config "$subject/docker-config"
    --fingerprint "$subject/artifact/fingerprint"
    --inspection-image "$inspection_image"
  )
}

replace_verify_value() {
  local flag="$1"
  local value="$2"
  local index
  for ((index = 0; index < ${#verify_args[@]}; index += 2)); do
    if [[ ${verify_args[$index]} == "$flag" ]]; then
      verify_args[$((index + 1))]="$value"
      return 0
    fi
  done
  exit 1
}

execute_verify() {
  local subject="$1"
  shift
  (
    env() {
      printf 'verifier used inherited exported env function\n' >&2
      exit 113
    }
    export -f env
    PATH="$subject/hostile-bin:/usr/bin:/bin" \
    HOME="$subject/home" \
    DOCKER_CONFIG="$subject/inherited-docker-config" \
    VERIFY_LEAK_SENTINEL='must-not-reach-docker' \
    CLIENT_HASH_SECRET='secret-must-not-reach-docker' \
    "$subject/scripts/verify_detached_submission_volume.sh" "$@"
  )
}

run_verify() {
  local subject="$1"
  build_verify_args "$subject"
  execute_verify "$subject" "${verify_args[@]}"
}

assert_redacted() {
  local subject="$1"
  local files=("$subject/stdout" "$subject/stderr")
  [[ ! -f "$subject/docker-calls.log" ]] || files+=("$subject/docker-calls.log")
  if grep -E 'must-not-reach-docker|secret-must-not-reach-docker' "${files[@]}" >/dev/null 2>&1; then
    printf 'verifier exposed an inherited secret\n' >&2
    exit 1
  fi
}

expect_pass() {
  local subject="$1"
  if ! run_verify "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected verifier success for %s\n' "$subject" >&2
    cat "$subject/stderr" >&2
    exit 1
  fi
  [[ "$(cat "$subject/stdout")" == 'detached submissions volume verified: approved-volume' && \
    ! -s "$subject/stderr" ]] || {
    printf 'verifier success output was not exact\n' >&2
    exit 1
  }
  [[ -f "$subject/state/removed" && -f "$subject/state/post-consumer-checked" ]] || {
    printf 'verifier did not complete constrained cleanup and post-checks\n' >&2
    exit 1
  }
  [[ "$(grep -c 'volume inspect' "$subject/docker-calls.log")" == 22 ]] || {
    printf 'verifier did not repeat all volume fingerprint queries\n' >&2
    exit 1
  }
  [[ "$(grep -c 'context inspect' "$subject/docker-calls.log")" == 2 && \
    "$(grep -c 'container ls' "$subject/docker-calls.log")" == 2 ]] || {
    printf 'verifier did not repeat context and consumer checks\n' >&2
    exit 1
  }
  assert_redacted "$subject"
}

expect_fail() {
  local subject="$1"
  if run_verify "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected verifier failure for %s\n' "$subject" >&2
    exit 1
  fi
  [[ ! -s "$subject/stdout" ]] || {
    printf 'failed verifier wrote stdout for %s\n' "$subject" >&2
    exit 1
  }
  assert_redacted "$subject"
}

subject="$(new_subject success)"
expect_pass "$subject"

subject="$(new_subject unterminated-println-suffix)"
printf 'forged-unterminated' >"$subject/state/println_unterminated_suffix"
expect_fail "$subject"

subject="$(new_subject metadata-main-only)"
write_state "$subject" inspection_metadata '/evidence/submissions.db|regular file|1'
expect_pass "$subject"

subject="$(new_subject metadata-any-order)"
write_state "$subject" inspection_metadata \
  '/evidence/submissions.db-wal|regular file|1' \
  '/evidence/submissions.db|regular file|1' \
  '/evidence/submissions.db-journal|regular file|1'
expect_pass "$subject"

for field in volume_name volume_driver volume_scope volume_mountpoint volume_created_at; do
  subject="$(new_subject "drift-$field")"
  write_state "$subject" "$field" 'drifted-value'
  expect_fail "$subject"
done

subject="$(new_subject label-drift)"
write_state "$subject" volume_label_alpha 'drifted-value'
expect_fail "$subject"

subject="$(new_subject unknown-fingerprint-key)"
printf 'unknown_key=value\n' >>"$subject/artifact/fingerprint"
expect_fail "$subject"

subject="$(new_subject duplicate-fingerprint-key)"
printf 'volume_name=approved-volume\n' >>"$subject/artifact/fingerprint"
expect_fail "$subject"

subject="$(new_subject malformed-label-index)"
sed -i.bak 's/volume_label_001=/volume_label_009=/' "$subject/artifact/fingerprint"
rm -f "$subject/artifact/fingerprint.bak"
expect_fail "$subject"

subject="$(new_subject label-without-value)"
sed -i.bak 's/volume_label_000=alpha=first/volume_label_000=alpha/' "$subject/artifact/fingerprint"
rm -f "$subject/artifact/fingerprint.bak"
expect_fail "$subject"

subject="$(new_subject reordered-fingerprint-fields)"
sed -i.bak 's/^docker_context=/temporary=/; s/^docker_host=/docker_context=/; s/^temporary=/docker_host=/' "$subject/artifact/fingerprint"
rm -f "$subject/artifact/fingerprint.bak"
expect_fail "$subject"

subject="$(new_subject reordered-label-indexes)"
sed -i.bak 's/^volume_label_000=/temporary=/; s/^volume_label_001=/volume_label_000=/; s/^temporary=/volume_label_001=/' "$subject/artifact/fingerprint"
rm -f "$subject/artifact/fingerprint.bak"
expect_fail "$subject"

subject="$(new_subject symlinked-fingerprint)"
mv "$subject/artifact/fingerprint" "$subject/artifact/real-fingerprint"
ln -s "$subject/artifact/real-fingerprint" "$subject/artifact/fingerprint"
expect_fail "$subject"

subject="$(new_subject non-0600-fingerprint)"
chmod 640 "$subject/artifact/fingerprint"
expect_fail "$subject"

subject="$(new_subject current-consumer)"
write_state "$subject" current_consumer "$consumer_id"
expect_fail "$subject"
[[ ! -f "$subject/state/created" ]] || {
  printf 'verifier inspected a volume with a current consumer\n' >&2
  exit 1
}

subject="$(new_subject tagged-inspection-image)"
build_verify_args "$subject"
replace_verify_value --inspection-image 'registry.example/crackledate-inspector:latest'
if execute_verify "$subject" "${verify_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected tagged inspection image rejection\n' >&2
  exit 1
fi
[[ ! -f "$subject/docker-calls.log" ]] || {
  printf 'tagged inspection image reached Docker\n' >&2
  exit 1
}

for case_name in unexpected-file directory symlink hard-link device socket fifo; do
  subject="$(new_subject "$case_name")"
  case "$case_name" in
    unexpected-file) write_state "$subject" inspection_metadata '/evidence/other.db|regular file|1' ;;
    directory) write_state "$subject" inspection_metadata '/evidence/submissions.db|directory|1' ;;
    symlink) write_state "$subject" inspection_metadata '/evidence/submissions.db|symbolic link|1' ;;
    hard-link) write_state "$subject" inspection_metadata '/evidence/submissions.db|regular file|2' ;;
    device) write_state "$subject" inspection_metadata '/evidence/submissions.db|character special file|1' ;;
    socket) write_state "$subject" inspection_metadata '/evidence/submissions.db|socket|1' ;;
    fifo) write_state "$subject" inspection_metadata '/evidence/submissions.db|fifo|1' ;;
  esac
  expect_fail "$subject"
  [[ -f "$subject/state/removed" ]] || {
    printf 'verifier did not remove inspection container for %s\n' "$case_name" >&2
    exit 1
  }
done

for case_name in empty-metadata duplicate-metadata malformed-metadata control-metadata; do
  subject="$(new_subject "$case_name")"
  case "$case_name" in
    empty-metadata) : >"$subject/state/inspection_metadata" ;;
    duplicate-metadata) write_state "$subject" inspection_metadata \
      '/evidence/submissions.db|regular file|1' \
      '/evidence/submissions.db|regular file|1' ;;
    malformed-metadata) write_state "$subject" inspection_metadata '/evidence/submissions.db|regular file|1|extra' ;;
    control-metadata) printf '/evidence/submissions.db|regular file|1\001\n' >"$subject/state/inspection_metadata" ;;
  esac
  expect_fail "$subject"
done

subject="$(new_subject create-stderr-redaction)"
: >"$subject/state/create_fail"
expect_fail "$subject"

subject="$(new_subject disappearing-volume)"
: >"$subject/state/disappearing"
expect_fail "$subject"

subject="$(new_subject post-inspection-consumer)"
write_state "$subject" post_consumer "$consumer_id"
expect_fail "$subject"

subject="$(new_subject failed-inspection-removal)"
: >"$subject/state/remove_fail"
expect_fail "$subject"
[[ -f "$subject/state/logged" && ! -f "$subject/state/post-consumer-checked" ]] || {
  printf 'verifier continued after failed inspection-container removal\n' >&2
  exit 1
}

subject="$(new_subject failed-inspection)"
write_state "$subject" inspection_exit '1'
expect_fail "$subject"
[[ -f "$subject/state/removed" ]] || {
  printf 'verifier did not clean up a failed inspection container\n' >&2
  exit 1
}

printf 'detached submission volume verification tests passed\n'
