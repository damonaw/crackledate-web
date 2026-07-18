#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-volume-capture-test.XXXXXX")"
scratch="$(CDPATH= cd -- "$scratch" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

capture_script="$repo_dir/scripts/capture_submissions_volume_identity.sh"
if [[ ! -f "$capture_script" ]]; then
  printf 'capture_submissions_volume_identity.sh is missing\n' >&2
  exit 1
fi

container_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
other_container_id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

write_state() {
  local subject="$1"
  local key="$2"
  shift 2
  printf '%s\n' "$@" >"$subject/state/$key"
}

new_subject() {
  local name="$1"
  local subject="$scratch/$name"
  mkdir -p "$subject/scripts" "$subject/bin" "$subject/hostile-bin" "$subject/home" "$subject/state" \
    "$subject/docker-config" "$subject/inherited-docker-config" "$subject/output"
  chmod 700 "$subject/output"
  cp "$capture_script" "$subject/scripts/capture_submissions_volume_identity.sh"
  chmod +x "$subject/scripts/capture_submissions_volume_identity.sh"
  # The tracked script must use this fixed production path.  Only the isolated
  # scratch copy gets the fake Docker directory prepended for this test.
  grep -Fqx 'safe_path="/usr/local/bin:/usr/bin:/bin"' "$capture_script" || {
    printf 'capture script does not use the fixed production PATH\n' >&2
    exit 1
  }
  grep -Fq '/usr/bin/env -i' "$capture_script" || {
    printf 'capture script does not invoke env by trusted absolute path\n' >&2
    exit 1
  }
  grep -Fq "stat -c '%d|%i'" "$capture_script" || {
    printf 'capture script does not prefer GNU stat identity probing\n' >&2
    exit 1
  }
  grep -Fq '"$(stat_identity "$output")" == "$published_identity"' "$capture_script" || {
    printf 'capture script does not compare published output identity\n' >&2
    exit 1
  }
  grep -Fq 'path_matches_identity()' "$capture_script" || {
    printf 'capture script lacks exact identity cleanup matching\n' >&2
    exit 1
  }
  if grep -F '/usr/bin/perl' "$capture_script" >/dev/null ||
    grep -F 'exec 3>"$output"' "$capture_script" >/dev/null; then
    printf 'capture script uses a nonportable descriptor publisher\n' >&2
    exit 1
  fi
  sed -i.bak "s|safe_path=\"/usr/local/bin:/usr/bin:/bin\"|safe_path=\"$subject/bin:/usr/local/bin:/usr/bin:/bin\"|" \
    "$subject/scripts/capture_submissions_volume_identity.sh"
  rm -f "$subject/scripts/capture_submissions_volume_identity.sh.bak"
  cat >"$subject/hostile-bin/docker" <<'HOSTILE_DOCKER'
#!/usr/bin/env bash
printf 'capture used inherited PATH Docker\n' >&2
exit 111
HOSTILE_DOCKER
  chmod +x "$subject/hostile-bin/docker"
  cat >"$subject/hostile-bin/env" <<'HOSTILE_ENV'
#!/usr/bin/env bash
printf 'capture used inherited PATH env\n' >&2
exit 112
HOSTILE_ENV
  chmod +x "$subject/hostile-bin/env"

  write_state "$subject" context 'approved-context'
  write_state "$subject" context_identity 'approved-context|unix:///approved/docker.sock'
  write_state "$subject" container_id "$container_id"
  write_state "$subject" container_project 'approved-project'
  write_state "$subject" container_service 'crackledate-site'
  write_state "$subject" mounts 'volume|approved-volume|/data'
  write_state "$subject" volume_name 'approved-volume'
  write_state "$subject" volume_driver 'local'
  write_state "$subject" volume_scope 'local'
  write_state "$subject" volume_mountpoint '/var/lib/docker/volumes/approved-volume/_data'
  write_state "$subject" volume_created_at '2026-07-18T12:34:56Z'
  write_state "$subject" volume_project 'approved-project'
  write_state "$subject" volume_logical 'submissions'
  write_state "$subject" volume_labels \
    'zeta=last' \
    'com.docker.compose.volume=submissions' \
    'alpha=first' \
    'com.docker.compose.project=approved-project'
  write_state "$subject" volume_label_keys \
    'alpha' \
    'com.docker.compose.project' \
    'com.docker.compose.volume' \
    'zeta'
  write_state "$subject" volume_label_count '4'
  write_state "$subject" volume_label_alpha 'first'
  write_state "$subject" volume_label_com.docker.compose.project 'approved-project'
  write_state "$subject" volume_label_com.docker.compose.volume 'submissions'
  write_state "$subject" volume_label_zeta 'last'

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

if [[ ${CAPTURE_LEAK_SENTINEL+x} == x || ${CLIENT_HASH_SECRET+x} == x ]]; then
  printf 'capture leaked inherited environment to Docker\n' >&2
  exit 90
fi
if [[ ${DOCKER_CONFIG:-} != "$subject/docker-config" ]]; then
  printf 'capture did not use the approved Docker config\n' >&2
  exit 91
fi
if [[ ${LC_ALL:-} != C ]]; then
  printf 'capture did not force the C locale\n' >&2
  exit 92
fi
if [[ ${1:-} != '--context' || ${2:-} != "$(cat "$state/context")" ]]; then
  printf 'capture omitted the explicit Docker context\n' >&2
  exit 93
fi
shift 2

emit() {
  local key="$1"
  if [[ -f "$state/$key" ]]; then
    cat "$state/$key"
  fi
}

case "${1:-}" in
  context)
    if [[ ${2:-} != inspect || ${3:-} != '--format' || \
      ${4:-} != '{{.Name}}|{{.Endpoints.docker.Host}}' || \
      ${5:-} != "$(cat "$state/context")" || $# -ne 5 ]]; then
      printf 'raw or malformed context inspect\n' >&2
      exit 94
    fi
    emit context_identity
    ;;
  container)
    if [[ ${2:-} != inspect || ${3:-} != '--format' || $# -ne 5 ]]; then
      printf 'raw or malformed container inspect\n' >&2
      exit 95
    fi
    format="$4"
    target="$5"
    [[ "$target" == "$(head -n 1 "$state/container_id")" ]] || {
      printf 'wrong container inspect target\n' >&2
      exit 96
    }
    case "$format" in
      '{{.Id}}') emit container_id ;;
      '{{index .Config.Labels "com.docker.compose.project"}}') emit container_project ;;
      '{{index .Config.Labels "com.docker.compose.service"}}') emit container_service ;;
      '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}{{end}}') emit mounts ;;
      *)
        printf 'unsafe container format\n' >&2
        exit 97
        ;;
    esac
    ;;
  volume)
    if [[ ${2:-} != inspect || ${3:-} != '--format' || $# -ne 5 ]]; then
      printf 'raw or malformed volume inspect\n' >&2
      exit 98
    fi
    format="$4"
    target="$5"
    [[ "$target" == "$(head -n 1 "$state/volume_name")" ]] || {
      printf 'wrong volume inspect target\n' >&2
      exit 99
    }
    case "$format" in
      '{{.Name}}') emit volume_name ;;
      '{{.Driver}}') emit volume_driver ;;
      '{{.Scope}}') emit volume_scope ;;
      '{{.Mountpoint}}') emit volume_mountpoint ;;
      '{{.CreatedAt}}') emit volume_created_at ;;
      '{{index .Labels "com.docker.compose.project"}}') emit volume_project ;;
      '{{index .Labels "com.docker.compose.volume"}}') emit volume_logical ;;
      '{{len .Labels}}') emit volume_label_count ;;
      '{{range $key, $_ := .Labels}}{{printf "%s" $key}}{{println}}{{end}}') emit volume_label_keys ;;
      *)
        if [[ "$format" =~ ^\{\{index\ .Labels\ \"([A-Za-z0-9_.-]+)\"\}\}$ ]]; then
          emit "volume_label_${BASH_REMATCH[1]}"
        else
          printf 'unsafe volume format\n' >&2
          exit 100
        fi
        ;;
    esac
    ;;
  *)
    printf 'mutating or unknown Docker command\n' >&2
    exit 101
    ;;
esac
FAKE_DOCKER
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

capture_args=()

build_capture_args() {
  local subject="$1"
  capture_args=(
    --docker-context approved-context
    --docker-host unix:///approved/docker.sock
    --docker-config "$subject/docker-config"
    --project-name approved-project
    --service crackledate-site
    --container-id "$container_id"
    --volume approved-volume
    --output "$subject/output/fingerprint"
  )
}

replace_capture_value() {
  local flag="$1"
  local value="$2"
  local index
  for ((index = 0; index < ${#capture_args[@]}; index += 2)); do
    if [[ "${capture_args[$index]}" == "$flag" ]]; then
      capture_args[$((index + 1))]="$value"
      return 0
    fi
  done
  printf 'test attempted to replace unknown option %s\n' "$flag" >&2
  exit 1
}

execute_capture() {
  local subject="$1"
  shift
  (
    env() {
      printf 'capture used inherited exported env function\n' >&2
      exit 113
    }
    export -f env
    PATH="$subject/hostile-bin:/usr/bin:/bin" \
    HOME="$subject/home" \
    DOCKER_CONFIG="$subject/inherited-docker-config" \
    CAPTURE_LEAK_SENTINEL='must-not-reach-docker' \
    CLIENT_HASH_SECRET='secret-must-not-reach-docker' \
    "$subject/scripts/capture_submissions_volume_identity.sh" "$@"
  )
}

run_capture() {
  local subject="$1"
  build_capture_args "$subject"
  execute_capture "$subject" "${capture_args[@]}"
}

assert_safe_calls() {
  local subject="$1"
  [[ -f "$subject/docker-calls.log" ]] || return 0
  if grep -E -- '(^| )(build|up|down|start|stop|restart|create|run|rm|kill|pause|unpause|update|exec|cp|pull|push)( |$)' \
    "$subject/docker-calls.log" >/dev/null; then
    printf 'capture invoked a mutating Docker verb\n' >&2
    exit 1
  fi
  if grep -E -- ' inspect( |$)' "$subject/docker-calls.log" | grep -v -- ' --format ' >/dev/null; then
    printf 'capture invoked raw docker inspect\n' >&2
    exit 1
  fi
}

assert_redacted() {
  local subject="$1"
  local files=("$subject/stdout" "$subject/stderr")
  [[ ! -f "$subject/docker-calls.log" ]] || files+=("$subject/docker-calls.log")
  if grep -E 'must-not-reach-docker|secret-must-not-reach-docker' "${files[@]}" >/dev/null 2>&1; then
    printf 'capture exposed an inherited secret\n' >&2
    exit 1
  fi
}

expect_pass() {
  local subject="$1"
  if ! run_capture "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected capture success for %s\n' "$subject" >&2
    cat "$subject/stderr" >&2
    exit 1
  fi
  if [[ "$(cat "$subject/stdout")" != 'submission volume fingerprint captured' || -s "$subject/stderr" ]]; then
    printf 'capture success output was not exact\n' >&2
    cat "$subject/stdout" "$subject/stderr" >&2
    exit 1
  fi
  cat >"$subject/expected" <<EOF
fingerprint_version=1
docker_context=approved-context
docker_host=unix:///approved/docker.sock
project_name=approved-project
service=crackledate-site
former_container_id=$container_id
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
  cmp "$subject/expected" "$subject/output/fingerprint"
  mode="$(stat -f '%Lp' "$subject/output/fingerprint" 2>/dev/null || stat -c '%a' "$subject/output/fingerprint")"
  [[ "$mode" == 600 ]] || {
    printf 'capture output mode was %s instead of 600\n' "$mode" >&2
    exit 1
  }
  assert_safe_calls "$subject"
  assert_redacted "$subject"
}

expect_fail() {
  local subject="$1"
  if run_capture "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected capture failure for %s\n' "$subject" >&2
    exit 1
  fi
  [[ ! -e "$subject/output/fingerprint" && ! -L "$subject/output/fingerprint" ]] || {
    printf 'failed capture left an output file for %s\n' "$subject" >&2
    exit 1
  }
  [[ ! -s "$subject/stdout" ]] || {
    printf 'failed capture wrote stdout for %s\n' "$subject" >&2
    exit 1
  }
  assert_safe_calls "$subject"
  assert_redacted "$subject"
}

subject="$(new_subject success)"
expect_pass "$subject"

# A value newline used to turn one Go-template label record into two output
# records.  Label enumeration plus one value query per safe key must reject it.
subject="$(new_subject newline-label-value)"
write_state "$subject" volume_label_alpha $'first\ninjected=record'
expect_fail "$subject"

# A key newline likewise must not be interpreted as additional label records.
subject="$(new_subject newline-label-key)"
write_state "$subject" volume_label_keys \
  'alpha' \
  $'broken\nkey' \
  'com.docker.compose.project' \
  'com.docker.compose.volume' \
  'zeta'
expect_fail "$subject"

# A returned control character is never safe to persist in the fingerprint.
subject="$(new_subject control-label-value)"
write_state "$subject" volume_label_alpha $'first\001control'
expect_fail "$subject"

subject="$(new_subject mismatched-daemon)"
write_state "$subject" context_identity 'approved-context|unix:///wrong/docker.sock'
expect_fail "$subject"

for field in container_project container_service volume_project volume_logical; do
  subject="$(new_subject "wrong-$field")"
  write_state "$subject" "$field" wrong-value
  expect_fail "$subject"

  subject="$(new_subject "missing-$field")"
  : >"$subject/state/$field"
  expect_fail "$subject"
done

subject="$(new_subject wrong-former-container-id)"
write_state "$subject" container_id "$other_container_id"
expect_fail "$subject"

subject="$(new_subject missing-data-mount)"
: >"$subject/state/mounts"
expect_fail "$subject"

subject="$(new_subject extra-data-mount)"
write_state "$subject" mounts 'volume|approved-volume|/data' 'volume|other-volume|/data'
expect_fail "$subject"

subject="$(new_subject bind-data-mount)"
write_state "$subject" mounts 'bind||/data'
expect_fail "$subject"

subject="$(new_subject malformed-identifier)"
build_capture_args "$subject"
replace_capture_value --project-name 'bad/project'
if execute_capture "$subject" "${capture_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected malformed identifier rejection\n' >&2
  exit 1
fi
[[ ! -e "$subject/output/fingerprint" ]] || exit 1
assert_safe_calls "$subject"
assert_redacted "$subject"

subject="$(new_subject uppercase-container-id)"
build_capture_args "$subject"
replace_capture_value --container-id 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
if execute_capture "$subject" "${capture_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected malformed container identifier rejection\n' >&2
  exit 1
fi
[[ ! -e "$subject/output/fingerprint" ]] || exit 1
assert_safe_calls "$subject"
assert_redacted "$subject"

subject="$(new_subject control-character)"
build_capture_args "$subject"
replace_capture_value --service $'bad\nservice'
if execute_capture "$subject" "${capture_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected control character rejection\n' >&2
  exit 1
fi
[[ ! -e "$subject/output/fingerprint" ]] || exit 1
assert_safe_calls "$subject"
assert_redacted "$subject"

subject="$(new_subject symlinked-docker-config)"
ln -s "$subject/docker-config" "$subject/docker-config-link"
build_capture_args "$subject"
replace_capture_value --docker-config "$subject/docker-config-link"
if execute_capture "$subject" "${capture_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected symlinked Docker config rejection\n' >&2
  exit 1
fi
[[ ! -e "$subject/output/fingerprint" ]] || exit 1
assert_safe_calls "$subject"
assert_redacted "$subject"

subject="$(new_subject existing-output)"
printf 'must remain unchanged\n' >"$subject/output/fingerprint"
build_capture_args "$subject"
if execute_capture "$subject" "${capture_args[@]}" >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected existing output rejection\n' >&2
  exit 1
fi
[[ "$(cat "$subject/output/fingerprint")" == 'must remain unchanged' ]] || {
  printf 'capture changed an existing output\n' >&2
  exit 1
}
assert_safe_calls "$subject"
assert_redacted "$subject"

subject="$(new_subject duplicate-option)"
build_capture_args "$subject"
if execute_capture "$subject" "${capture_args[@]}" --volume approved-volume >"$subject/stdout" 2>"$subject/stderr"; then
  printf 'expected duplicate option rejection\n' >&2
  exit 1
fi
[[ ! -e "$subject/output/fingerprint" ]] || exit 1
assert_safe_calls "$subject"
assert_redacted "$subject"

printf 'submission volume fingerprint capture tests passed\n'
