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
          '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}{{end}}') emit mount ;;
          '{{range .Config.Env}}{{if eq (printf "%.17s" .) "SUBMISSIONS_PATH="}}{{if eq . "SUBMISSIONS_PATH=/data/submissions.db"}}exact{{else}}invalid{{end}}{{println}}{{end}}{{end}}') emit submissions ;;
          '{{range .Config.Env}}{{if eq (printf "%.19s" .) "CLIENT_HASH_SECRET="}}{{if gt (len .) 19}}present-nonempty{{else}}present-empty{{end}}{{println}}{{end}}{{end}}') emit secret ;;
          '{{range .Config.Env}}{{if eq (printf "%.27s" .) "RETIRE_LEGACY_ACCOUNT_DATA="}}{{if eq . "RETIRE_LEGACY_ACCOUNT_DATA="}}empty{{else if eq . "RETIRE_LEGACY_ACCOUNT_DATA=confirmed"}}confirmed{{else}}invalid{{end}}{{println}}{{end}}{{end}}') emit retirement ;;
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

runbook="$repo_dir/docs/runbooks/submissions-database.md"
required_runbook_contracts=(
  'verify_identity() {'
  'require_empty_retirement_env_file() {'
  'APPROVED_DOCKER_HOST'
  'APPROVED_DOCKER_CONFIG'
  'APPROVED_CURRENT_REVISION'
  'APPROVED_NEW_REVISION'
  'APPROVED_PRIOR_REVISION'
  'OBSERVED_CURRENT_REVISION'
  'AUTO_UPDATERS_DISABLED'
  '--phase "$expected_phase"'
  'CRACKLEDATE_IMAGE="$APPROVED_PRODUCTION_IMAGE"'
  'CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_EXISTING_VOLUME"'
  'CRACKLEDATE_RESTART_POLICY="$APPROVED_NORMAL_RESTART_POLICY"'
  '--mount "type=volume,src=$ROLLBACK_VOLUME,dst=/target,readonly"'
  '/reviewed-copy-verified-main'
  'confirmed-post-start-verification'
  'does not authorize production work'
  'stat -f '\''%u:%g:%Lp'\'' -- "$RECONCILE_DIRECTORY"'
  'stat -c '\''%u:%g:%a'\'' -- "$RECONCILE_DIRECTORY"'
  'stat -f '\''%u:%g:%Lp'\'' -- "$RECONCILED_DATABASE"'
  'stat -c '\''%u:%g:%a'\'' -- "$RECONCILED_DATABASE"'
)
for contract in "${required_runbook_contracts[@]}"; do
  if ! grep -Fq -- "$contract" "$runbook"; then
    printf 'runbook contract missing: %s\n' "$contract" >&2
    exit 1
  fi
done
if ! confirmed_create_count="$(awk '
  /^```bash$/ {
    in_fence = 1
    current = ""
    next
  }
  /^```$/ && in_fence {
    if (current ~ /RETIRE_LEGACY_ACCOUNT_DATA=confirmed/ &&
        current ~ /up --no-start --no-deps --force-recreate --no-build --pull never/) {
      confirmed_creates++
      if (previous !~ /(^|\n)require_empty_retirement_env_file(\n|$)/) invalid = 1
    }
    previous = current
    in_fence = 0
    next
  }
  in_fence { current = current $0 "\n" }
  END {
    if (invalid) exit 1
    print confirmed_creates + 0
  }
' "$runbook")"; then
  printf 'confirmed stopped-create path missing adjacent empty retirement check\n' >&2
  exit 1
fi
if [[ "$confirmed_create_count" -ne 2 ]]; then
  printf 'runbook must contain exactly two guarded confirmed stopped-create paths\n' >&2
  exit 1
fi
rollback_static_failure=0
rollback_contracts=(
  'APPROVED_ROLLBACK_TRAFFIC_REDRAINED'
  'APPROVED_ROLLBACK_WRITES_BLOCKED'
  'APPROVED_FAILED_IMAGE'
  'APPROVED_FAILED_CONTAINER_ID'
  'APPROVED_FAILED_IMAGE_ID'
  'APPROVED_FAILED_REVISION'
  'APPROVED_FAILED_VOLUME'
  'APPROVED_FAILED_RESTART'
  'APPROVED_FAILED_RETIREMENT'
  'APPROVED_FAILED_STATE'
  'APPROVED_FAILED_PHASE'
  'APPROVED_FAILED_STOPPED_PHASE'
  'test "$APPROVED_FAILED_STATE" = running'
  'test "$APPROVED_FAILED_STATE" = stopped'
  'CRACKLEDATE_IMAGE="$APPROVED_FAILED_IMAGE"'
  'CRACKLEDATE_SUBMISSIONS_VOLUME="$APPROVED_FAILED_VOLUME"'
  'No observed output selects a rollback branch.'
  'Never remove, rename, empty, restore over, or mount the failed volume read-write.'
)
for contract in "${rollback_contracts[@]}"; do
  if ! grep -Fq -- "$contract" "$runbook"; then
    rollback_static_failure=1
  fi
done
if [[ $rollback_static_failure -ne 0 ]]; then
  printf 'rollback transition contract is incomplete\n' >&2
fi
if grep -Fq -- 'APPROVED_FAILED_STOPPED_RESTART' "$runbook"; then
  printf 'rollback stopped convergence must require restart no\n' >&2
  rollback_static_failure=1
fi
if ! rollback_adjacency="$(awk '
  /^## Pre-write rollback$/ {
    in_rollback = 1
    previous = ""
    next
  }
  /^## / && in_rollback { in_rollback = 0 }
  !in_rollback { next }
  /^```bash$/ {
    in_fence = 1
    current = ""
    next
  }
  /^```$/ && in_fence {
    if (expect_same_state_no) {
      if (current !~ /verify_identity/ ||
          current !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          current !~ /"\$APPROVED_FAILED_RETIREMENT" "\$APPROVED_FAILED_STATE" "\$APPROVED_FAILED_PHASE"/) invalid = 1
      expect_same_state_no = 0
    }
    if (expect_stopped) {
      if (current !~ /verify_identity/ ||
          current !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          current !~ /"\$APPROVED_FAILED_RETIREMENT" stopped "\$APPROVED_FAILED_STOPPED_PHASE"/) invalid = 1
      expect_stopped = 0
    }

    mutation = 0
    if (current ~ /container update --restart no "\$APPROVED_FAILED_CONTAINER_ID"/) {
      mutation = 1
      updates++
      if (previous !~ /verify_identity/ ||
          previous !~ /"\$APPROVED_FAILED_VOLUME" "\$APPROVED_FAILED_RESTART"/ ||
          previous !~ /"\$APPROVED_FAILED_RETIREMENT" "\$APPROVED_FAILED_STATE" "\$APPROVED_FAILED_PHASE"/) invalid = 1
      expect_same_state_no = 1
    }
    if (current ~ /CRACKLEDATE_IMAGE="\$APPROVED_FAILED_IMAGE"/ && current ~ /stop "\$SERVICE"/) {
      mutation = 1
      stops++
      if (previous !~ /verify_identity/ ||
          previous !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          previous !~ /"\$APPROVED_FAILED_RETIREMENT" running "\$APPROVED_FAILED_PHASE"/) invalid = 1
      if (current !~ /DOCKER_CONFIG="\$APPROVED_DOCKER_CONFIG"/ ||
          current !~ /COMPOSE_DISABLE_ENV_FILE=1/ ||
          current !~ /CRACKLEDATE_SUBMISSIONS_VOLUME="\$APPROVED_FAILED_VOLUME"/ ||
          current !~ /CRACKLEDATE_RESTART_POLICY=no/ ||
          current !~ /docker --context "\$APPROVED_DOCKER_CONTEXT" compose/ ||
          current !~ /--env-file "\$APPROVED_ENV_FILE" -f "\$COMPOSE_FILE"/ ||
          current !~ /--project-directory "\$PROJECT_DIRECTORY" --project-name "\$PROJECT_NAME"/ ||
          current ~ /RETIRE_LEGACY_ACCOUNT_DATA/) invalid = 1
      expect_stopped = 1
    }
    if (current ~ /volume create "\$ROLLBACK_VOLUME"/) {
      mutation = 1
      volume_creates++
      if (previous !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          previous !~ /"\$APPROVED_FAILED_RETIREMENT" stopped "\$APPROVED_FAILED_STOPPED_PHASE"/) invalid = 1
    }
    if (current ~ /\/reviewed-copy-verified-main/) {
      mutation = 1
      copies++
      if (previous !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          previous !~ /"\$APPROVED_FAILED_RETIREMENT" stopped "\$APPROVED_FAILED_STOPPED_PHASE"/) invalid = 1
    }
    if (current ~ /up --no-start --no-deps --force-recreate --no-build --pull never/) {
      mutation = 1
      creates++
      if (previous !~ /"\$APPROVED_FAILED_VOLUME" no/ ||
          previous !~ /"\$APPROVED_FAILED_RETIREMENT" stopped "\$APPROVED_FAILED_STOPPED_PHASE"/ ||
          previous !~ /require_empty_retirement_env_file/) invalid = 1
    }
    if (current ~ /start "\$SERVICE"/) {
      mutation = 1
      starts++
    }
    if (current ~ /test "\$APPROVED_FAILED_STATE" = stopped/ &&
        current ~ /verify_identity/ &&
        current ~ /"\$APPROVED_FAILED_VOLUME" no/ &&
        current ~ /"\$APPROVED_FAILED_RETIREMENT" stopped "\$APPROVED_FAILED_STOPPED_PHASE"/) {
      stopped_branch_guards++
    }
    if (mutation) {
      mutations++
      if (previous !~ /verify_identity/) invalid = 1
    }
    previous = current
    in_fence = 0
    next
  }
  in_fence { current = current $0 "\n" }
  END {
    if (expect_same_state_no || expect_stopped || invalid) exit 1
    printf "%d:%d:%d:%d:%d:%d:%d:%d\n", mutations, updates, stops, volume_creates, copies, creates, starts, stopped_branch_guards
  }
' "$runbook")"; then
  printf 'rollback mutation is missing an adjacent identity guard\n' >&2
  rollback_static_failure=1
elif [[ "$rollback_adjacency" != '6:1:1:1:1:1:1:1' ]]; then
  printf 'rollback transition must contain the exact guarded mutation set\n' >&2
  rollback_static_failure=1
fi
if [[ $rollback_static_failure -ne 0 ]]; then
  exit 1
fi
if grep -Fq -- '--revision "$OBSERVED_' "$runbook"; then
  printf 'runbook uses an observed revision as an approved expectation\n' >&2
  exit 1
fi
if [[ "$(grep -Fc -- 'resolve_full_container_id' "$runbook")" -lt 8 ]]; then
  printf 'runbook does not re-resolve container identity around every mutation\n' >&2
  exit 1
fi
if [[ "$(grep -Fc -- 'verify_identity ' "$runbook")" -lt 12 ]]; then
  printf 'runbook does not place literal identity guards around mutations\n' >&2
  exit 1
fi

printf 'verify_deployment_identity self-tests passed\n'
