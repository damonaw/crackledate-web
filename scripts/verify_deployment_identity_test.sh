#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-identity-test.XXXXXX")"
scratch="$(CDPATH= cd -- "$scratch" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

if [[ ! -f "$repo_dir/scripts/verify_deployment_identity.sh" ]]; then
  printf 'deployment identity verifier is missing\n' >&2
  exit 1
fi

container_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
extra_id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
image_id='sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
revision='dddddddddddddddddddddddddddddddddddddddd'

write_state() {
  local subject="$1"
  local key="$2"
  shift 2
  printf '%s\n' "$@" >"$subject/state/$key"
}

new_subject() {
  local name="$1"
  local subject="$scratch/$name"
  mkdir -p "$subject/scripts" "$subject/bin" "$subject/home" "$subject/project" "$subject/state" \
    "$subject/docker-config" "$subject/inherited-docker-config"
  cp "$repo_dir/scripts/verify_deployment_identity.sh" "$subject/scripts/verify_deployment_identity.sh"
  chmod +x "$subject/scripts/verify_deployment_identity.sh"
  : >"$subject/project/compose.yml"
  : >"$subject/approved.env"
  chmod 600 "$subject/approved.env"

  write_state "$subject" context 'approved-context'
  write_state "$subject" context_identity 'approved-context|unix:///approved/docker.sock'
  write_state "$subject" compose_container "$container_id"
  write_state "$subject" project 'approved-project'
  write_state "$subject" service 'crackledate-site'
  write_state "$subject" working_dir "$subject/project"
  write_state "$subject" config_file "$subject/project/compose.yml"
  write_state "$subject" container_id "$container_id"
  write_state "$subject" image_id "$image_id"
  write_state "$subject" revision "$revision"
  write_state "$subject" mount 'volume|approved-volume|/data'
  write_state "$subject" submissions 'exact'
  write_state "$subject" secret 'present-nonempty'
  write_state "$subject" retirement 'empty'
  write_state "$subject" restart 'unless-stopped'
  write_state "$subject" run_state 'stopped'
  write_state "$subject" consumers "$container_id"
  write_state "$subject" extra_state 'stopped'
  write_state "$subject" secret_value 'identity-secret-must-never-appear'

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

if [[ ${IDENTITY_LEAK_SENTINEL+x} == x || ${CLIENT_HASH_SECRET+x} == x ]]; then
  printf 'identity verifier leaked inherited environment to Docker\n' >&2
  exit 91
fi
if [[ ${DOCKER_CONFIG:-} != "$subject/docker-config" ]]; then
  printf 'identity verifier did not use the independently approved Docker config\n' >&2
  exit 90
fi

emit() {
  local key="$1"
  if [[ -f "$state/$key" ]]; then
    cat "$state/$key"
  fi
}

emit_println() {
  emit "$1"
  printf '\n'
  if [[ -f "$state/println_unterminated_suffix" ]]; then
    printf '%s' "$(<"$state/println_unterminated_suffix")"
  fi
}

if [[ ${1:-} != '--context' || ${2:-} != "$(cat "$state/context")" ]]; then
  printf 'missing or wrong explicit Docker context\n' >&2
  exit 92
fi
shift 2

if [[ "$(wc -l <"$subject/docker-calls.log" | tr -d ' ')" -eq 1 && ${1:-} != context ]]; then
  printf 'context endpoint was not the first Docker query\n' >&2
  exit 88
fi

case "${1:-}" in
  context)
    if [[ ${2:-} != inspect || ${3:-} != '--format' || ${4:-} != '{{.Name}}|{{.Endpoints.docker.Host}}' || ${5:-} != "$(cat "$state/context")" || $# -ne 5 ]]; then
      printf 'raw or malformed context identity query\n' >&2
      exit 89
    fi
    emit context_identity
    ;;
  compose)
    shift
    expected=(
      --env-file "$subject/approved.env"
      -f "$subject/project/compose.yml"
      --project-directory "$subject/project"
      --project-name approved-project
      ps --all --quiet crackledate-site
    )
    if [[ $# -ne ${#expected[@]} ]]; then
      printf 'unexpected Compose identity query\n' >&2
      exit 93
    fi
    for ((index = 0; index < ${#expected[@]}; index++)); do
      position=$((index + 1))
      if [[ "${!position}" != "${expected[$index]}" ]]; then
        printf 'unexpected Compose identity argument\n' >&2
        exit 94
      fi
    done
    emit compose_container
    ;;
  container)
    case "${2:-}" in
      inspect)
        if [[ ${3:-} != '--format' || $# -ne 5 ]]; then
          printf 'raw or malformed container inspect\n' >&2
          exit 95
        fi
        format="$4"
        target="$5"
        case "$format" in
          '{{index .Config.Labels "com.docker.compose.project"}}') emit project ;;
          '{{index .Config.Labels "com.docker.compose.service"}}') emit service ;;
          '{{index .Config.Labels "com.docker.compose.project.working_dir"}}') emit working_dir ;;
          '{{index .Config.Labels "com.docker.compose.project.config_files"}}') emit config_file ;;
          '{{.Id}}') emit container_id ;;
          '{{.Image}}') emit image_id ;;
          '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}{{end}}') emit_println mount ;;
          '{{range .Config.Env}}{{if eq (printf "%.17s" .) "SUBMISSIONS_PATH="}}{{if eq . "SUBMISSIONS_PATH=/data/submissions.db"}}exact{{else}}invalid{{end}}{{println}}{{end}}{{end}}') emit_println submissions ;;
          '{{range .Config.Env}}{{if eq (printf "%.19s" .) "CLIENT_HASH_SECRET="}}{{if gt (len .) 19}}present-nonempty{{else}}present-empty{{end}}{{println}}{{end}}{{end}}') emit_println secret ;;
          '{{range .Config.Env}}{{if eq (printf "%.27s" .) "RETIRE_LEGACY_ACCOUNT_DATA="}}{{if eq . "RETIRE_LEGACY_ACCOUNT_DATA="}}empty{{else if eq . "RETIRE_LEGACY_ACCOUNT_DATA=confirmed"}}confirmed{{else}}invalid{{end}}{{println}}{{end}}{{end}}') emit_println retirement ;;
          '{{.HostConfig.RestartPolicy.Name}}') emit restart ;;
          '{{if eq .State.Status "running"}}running{{else if or (eq .State.Status "created") (eq .State.Status "exited")}}stopped{{else}}invalid{{end}}')
            if [[ "$target" == "$(head -n 1 "$state/container_id")" ]]; then
              emit run_state
            else
              emit extra_state
            fi
            ;;
          *)
            cat "$state/secret_value"
            printf 'unsafe or overbroad container format\n' >&2
            exit 96
            ;;
        esac
        ;;
      ls)
        if [[ ${3:-} != '--all' || ${4:-} != '--no-trunc' || ${5:-} != '--filter' || ${6:-} != 'volume=approved-volume' || ${7:-} != '--format' || ${8:-} != '{{.ID}}' || $# -ne 8 ]]; then
          printf 'unexpected volume consumer enumeration\n' >&2
          exit 97
        fi
        emit consumers
        if [[ -f "$state/swap-approved-env" ]]; then
          : >"$subject/approved.env.replacement"
          chmod 600 "$subject/approved.env.replacement"
          mv "$subject/approved.env.replacement" "$subject/approved.env"
        fi
        ;;
      *)
        printf 'mutating or unknown container command\n' >&2
        exit 98
        ;;
    esac
    ;;
  image)
    if [[ ${2:-} != inspect || ${3:-} != '--format' || ${4:-} != '{{index .Config.Labels "org.opencontainers.image.revision"}}' || ${5:-} != "$(cat "$state/image_id")" || $# -ne 5 ]]; then
      printf 'raw or malformed image inspect\n' >&2
      exit 99
    fi
    emit revision
    ;;
  *)
    printf 'mutating or unknown Docker command\n' >&2
    exit 100
    ;;
esac
FAKE_DOCKER
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

guard_args=()

build_guard_args() {
  local subject="$1"
  local restart_policy="${2:-unless-stopped}"
  local retirement_state="${3:-empty}"
  local expected_state="${4:-stopped}"
  local phase="${5:-normal}"
  guard_args=(
    --docker-context approved-context
    --docker-host unix:///approved/docker.sock
    --docker-config "$subject/docker-config"
    --env-file "$subject/approved.env"
    --compose-file "$subject/project/compose.yml"
    --project-directory "$subject/project"
    --project-name approved-project
    --service crackledate-site
    --container-id "$container_id"
    --image-id "$image_id"
    --revision "$revision"
    --volume approved-volume
    --restart-policy "$restart_policy"
    --retirement-state "$retirement_state"
    --expected-state "$expected_state"
    --phase "$phase"
  )
}

replace_guard_value() {
  local flag="$1"
  local value="$2"
  local index
  for ((index = 0; index < ${#guard_args[@]}; index += 2)); do
    if [[ "${guard_args[$index]}" == "$flag" ]]; then
      guard_args[$((index + 1))]="$value"
      return 0
    fi
  done
  printf 'test attempted to replace unknown guard flag %s\n' "$flag" >&2
  exit 1
}

execute_guard() {
  local subject="$1"
  shift
  env -i \
    PATH="$subject/bin:/usr/bin:/bin" \
    HOME="$subject/home" \
    DOCKER_CONFIG="$subject/inherited-docker-config" \
    IDENTITY_LEAK_SENTINEL='must-not-reach-docker' \
    CLIENT_HASH_SECRET='must-not-reach-docker' \
    "$subject/scripts/verify_deployment_identity.sh" "$@"
}

run_guard() {
  local subject="$1"
  build_guard_args "$subject"
  execute_guard "$subject" "${guard_args[@]}"
}

assert_read_only_calls() {
  local subject="$1"
  [[ -f "$subject/docker-calls.log" ]] || return 0
  if rg -n -- '( build| up| down| start| stop| restart| create| run| rm| kill| pause| unpause| update| exec| cp| volume (create|rm)| image (pull|rm))' "$subject/docker-calls.log" >/dev/null; then
    printf 'identity verifier invoked a mutating Docker command\n' >&2
    exit 1
  fi
  if rg -n -- ' inspect($| )' "$subject/docker-calls.log" | rg -v -- ' --format ' >/dev/null; then
    printf 'identity verifier invoked raw inspect\n' >&2
    exit 1
  fi
}

assert_redacted() {
  local subject="$1"
  local files=("$subject/stdout" "$subject/stderr")
  if [[ -f "$subject/docker-calls.log" ]]; then
    files+=("$subject/docker-calls.log")
  fi
  if rg -q 'identity-secret-must-never-appear|must-not-reach-docker' "${files[@]}" 2>/dev/null; then
    printf 'identity verifier exposed a secret or inherited sentinel\n' >&2
    exit 1
  fi
}

expect_pass() {
  local subject="$1"
  if ! run_guard "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected deployment identity success for %s\n' "$subject" >&2
    exit 1
  fi
  if [[ "$(cat "$subject/stdout")" != 'deployment identity verified' || -s "$subject/stderr" ]]; then
    printf 'deployment identity success output was not the exact non-secret result\n' >&2
    exit 1
  fi
  assert_read_only_calls "$subject"
  assert_redacted "$subject"
}

expect_fail() {
  local subject="$1"
  if run_guard "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected deployment identity failure for %s\n' "$subject" >&2
    exit 1
  fi
  if [[ -s "$subject/stdout" ]]; then
    printf 'deployment identity failure must not write stdout\n' >&2
    exit 1
  fi
  if [[ "$(cat "$subject/stderr")" != 'deployment identity verification failed' ]]; then
    printf 'deployment identity failure must be generic\n' >&2
    exit 1
  fi
  assert_read_only_calls "$subject"
  assert_redacted "$subject"
}

expect_pass_args() {
  local subject="$1"
  shift
  if ! execute_guard "$subject" "$@" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected deployment identity success for %s\n' "$subject" >&2
    exit 1
  fi
  if [[ "$(cat "$subject/stdout")" != 'deployment identity verified' || -s "$subject/stderr" ]]; then
    printf 'deployment identity success output was not the exact non-secret result\n' >&2
    exit 1
  fi
  assert_read_only_calls "$subject"
  assert_redacted "$subject"
}

expect_fail_args() {
  local subject="$1"
  shift
  if execute_guard "$subject" "$@" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected deployment identity failure for %s\n' "$subject" >&2
    exit 1
  fi
  if [[ -s "$subject/stdout" ]]; then
    printf 'deployment identity failure must not write stdout\n' >&2
    exit 1
  fi
  if [[ "$(cat "$subject/stderr")" != 'deployment identity verification failed' ]]; then
    printf 'deployment identity failure must be generic\n' >&2
    exit 1
  fi
  assert_read_only_calls "$subject"
  assert_redacted "$subject"
}

subject="$(new_subject valid)"
expect_pass "$subject"

subject="$(new_subject unterminated-println-suffix)"
printf 'forged-unterminated' >"$subject/state/println_unterminated_suffix"
expect_fail "$subject"

fields=(context_identity project service working_dir config_file container_id image_id revision mount submissions secret retirement restart run_state compose_container)
wrong_values=('approved-context|unix:///wrong/docker.sock' wrong-project wrong-service /wrong/workdir /wrong/config wrong-id wrong-image wrong-revision 'bind||/data' invalid present-empty confirmed always running wrong-compose-id)

for ((index = 0; index < ${#fields[@]}; index++)); do
  subject="$(new_subject "mismatch-${fields[$index]}")"
  write_state "$subject" "${fields[$index]}" "${wrong_values[$index]}"
  expect_fail "$subject"

  subject="$(new_subject "missing-${fields[$index]}")"
  : >"$subject/state/${fields[$index]}"
  expect_fail "$subject"

  subject="$(new_subject "duplicate-${fields[$index]}")"
  original="$(cat "$subject/state/${fields[$index]}")"
  write_state "$subject" "${fields[$index]}" "$original" "$original"
  expect_fail "$subject"
done

subject="$(new_subject multiline-endpoint)"
write_state "$subject" context_identity 'approved-context|unix:///approved/docker.sock' 'forged-second-endpoint'
expect_fail "$subject"

all_flags=(
  --docker-context --docker-host --docker-config --env-file --compose-file
  --project-directory --project-name --service --container-id --image-id
  --revision --volume --restart-policy --retirement-state --expected-state --phase
)

for flag in "${all_flags[@]}"; do
  subject="$(new_subject "duplicate-flag-${flag#--}")"
  build_guard_args "$subject"
  duplicate_value='duplicate'
  for ((index = 0; index < ${#guard_args[@]}; index += 2)); do
    if [[ "${guard_args[$index]}" == "$flag" ]]; then
      duplicate_value="${guard_args[$((index + 1))]}"
      break
    fi
  done
  expect_fail_args "$subject" "${guard_args[@]}" "$flag" "$duplicate_value"

  subject="$(new_subject "missing-flag-${flag#--}")"
  build_guard_args "$subject"
  reduced_args=()
  for ((index = 0; index < ${#guard_args[@]}; index += 2)); do
    if [[ "${guard_args[$index]}" != "$flag" ]]; then
      reduced_args+=("${guard_args[$index]}" "${guard_args[$((index + 1))]}")
    fi
  done
  expect_fail_args "$subject" "${reduced_args[@]}"
done

injection_flags=(
  --docker-context --docker-host --project-name --service --container-id
  --image-id --revision --volume --restart-policy --retirement-state
  --expected-state --phase
)
for flag in "${injection_flags[@]}"; do
  subject="$(new_subject "option-injection-${flag#--}")"
  build_guard_args "$subject"
  replace_guard_value "$flag" '--attacker-option'
  expect_fail_args "$subject" "${guard_args[@]}"
done

for flag in "${all_flags[@]}"; do
  subject="$(new_subject "control-injection-${flag#--}")"
  build_guard_args "$subject"
  replace_guard_value "$flag" $'bad\tvalue'
  expect_fail_args "$subject" "${guard_args[@]}"
done

lexical_flags=(--env-file --compose-file --project-directory --docker-config)
for ((index = 0; index < ${#lexical_flags[@]}; index++)); do
  subject="$(new_subject "lexical-${lexical_flags[$index]#--}")"
  build_guard_args "$subject"
  case "${lexical_flags[$index]}" in
    --env-file) lexical_value="$subject/project/../approved.env" ;;
    --compose-file) lexical_value="$subject/project/../project/compose.yml" ;;
    --project-directory) lexical_value="$subject/project/../project" ;;
    --docker-config) lexical_value="$subject/project/../docker-config" ;;
  esac
  replace_guard_value "${lexical_flags[$index]}" "$lexical_value"
  expect_fail_args "$subject" "${guard_args[@]}"
done

for flag in --env-file --compose-file --project-directory --docker-config; do
  subject="$(new_subject "ancestor-symlink-${flag#--}")"
  ln -s "$subject" "$subject/ancestor"
  build_guard_args "$subject"
  case "$flag" in
    --env-file) alias_value="$subject/ancestor/approved.env" ;;
    --compose-file) alias_value="$subject/ancestor/project/compose.yml" ;;
    --project-directory) alias_value="$subject/ancestor/project" ;;
    --docker-config) alias_value="$subject/ancestor/docker-config" ;;
  esac
  replace_guard_value "$flag" "$alias_value"
  expect_fail_args "$subject" "${guard_args[@]}"
done

subject="$(new_subject hardlink-env)"
ln "$subject/approved.env" "$subject/approved.env.link"
expect_fail "$subject"

subject="$(new_subject hardlink-compose)"
ln "$subject/project/compose.yml" "$subject/project/compose.yml.link"
expect_fail "$subject"

subject="$(new_subject deterministic-swap)"
: >"$subject/state/swap-approved-env"
expect_fail "$subject"

subject="$(new_subject redacted-missing-path)"
build_guard_args "$subject"
replace_guard_value --env-file "$subject/identity-secret-must-never-appear/missing.env"
expect_fail_args "$subject" "${guard_args[@]}"

subject="$(new_subject malicious-output)"
write_state "$subject" project 'approved-project' 'forged-extra-line'
expect_fail "$subject"

subject="$(new_subject no-consumer)"
: >"$subject/state/consumers"
expect_fail "$subject"

subject="$(new_subject duplicate-consumer)"
write_state "$subject" consumers "$container_id" "$container_id"
expect_fail "$subject"

subject="$(new_subject extra-stopped-consumer)"
write_state "$subject" consumers "$container_id" "$extra_id"
write_state "$subject" extra_state stopped
expect_fail "$subject"

subject="$(new_subject extra-running-consumer)"
write_state "$subject" consumers "$container_id" "$extra_id"
write_state "$subject" extra_state running
expect_fail "$subject"

subject="$(new_subject malicious-consumer-id)"
write_state "$subject" consumers "$container_id" '--context=attacker'
expect_fail "$subject"

subject="$(new_subject confirmed-prestart)"
write_state "$subject" retirement confirmed
write_state "$subject" restart no
build_guard_args "$subject" no confirmed stopped confirmed-prestart
expect_pass_args "$subject" "${guard_args[@]}"

subject="$(new_subject confirmed-non-no-restart)"
write_state "$subject" retirement confirmed
build_guard_args "$subject" unless-stopped confirmed stopped confirmed-prestart
expect_fail_args "$subject" "${guard_args[@]}"

subject="$(new_subject confirmed-running-without-poststart-phase)"
write_state "$subject" retirement confirmed
write_state "$subject" restart no
write_state "$subject" run_state running
build_guard_args "$subject" no confirmed running confirmed-prestart
expect_fail_args "$subject" "${guard_args[@]}"

subject="$(new_subject confirmed-poststart-verification)"
write_state "$subject" retirement confirmed
write_state "$subject" restart no
write_state "$subject" run_state running
build_guard_args "$subject" no confirmed running confirmed-post-start-verification
expect_pass_args "$subject" "${guard_args[@]}"

subject="$(new_subject running)"
write_state "$subject" run_state running
build_guard_args "$subject" unless-stopped empty running normal
expect_pass_args "$subject" "${guard_args[@]}"

guard_script="$repo_dir/scripts/verify_deployment_identity.sh"
required_guard_contracts=(
  'query_exact revision "$revision" image inspect --format'
  'query_println_exact mount "volume|$volume|/data" container inspect --format'
  'query_println_exact submissions-path exact container inspect --format'
  'query_println_exact secret-state present-nonempty container inspect --format'
  'query_println_exact retirement "$retirement_state" container inspect --format'
  'state_format='
)
for contract in "${required_guard_contracts[@]}"; do
  if ! grep -Fq -- "$contract" "$guard_script"; then
    printf 'legacy runtime guard contract missing: %s\n' "$contract" >&2
    exit 1
  fi
done

identity_test_source="$repo_dir/scripts/verify_deployment_identity_test.sh"
legacy_runbook_reference='docs/runbooks/'"submissions-database.md"
retired_runbook_contracts=(
  'verify_'"identity() {"
  'require_empty_'"retirement_env_file() {"
)
if grep -Fq -- "$legacy_runbook_reference" "$identity_test_source"; then
  printf 'legacy identity test still depends on the decommission runbook\n' >&2
  exit 1
fi
for contract in "${retired_runbook_contracts[@]}"; do
  if grep -Fq -- "$contract" "$identity_test_source"; then
    printf 'legacy identity test still requires a retired runbook function\n' >&2
    exit 1
  fi
done
printf 'verify_deployment_identity self-tests passed\n'
