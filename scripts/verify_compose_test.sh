#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-compose-test.XXXXXX")"
scratch="$(CDPATH= cd -- "$scratch" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

if [[ ! -f "$repo_dir/scripts/verify_compose.sh" ]]; then
  printf 'compose verifier is missing\n' >&2
  exit 1
fi

new_subject() {
  local name="$1"
  local subject="$scratch/$name"
  mkdir -p "$subject/scripts" "$subject/bin" "$subject/home"
  cp "$repo_dir/docker-compose.yml" "$subject/docker-compose.yml"
  cp "$repo_dir/scripts/verify_compose.sh" "$subject/scripts/verify_compose.sh"
  chmod +x "$subject/scripts/verify_compose.sh"
  cat >"$subject/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail

bin_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
subject="$(CDPATH= cd -- "$bin_dir/.." && pwd -P)"
printf '%s\n' "$*" >>"$subject/docker-calls.log"

if [[ ${LEAK_SENTINEL+x} == x || ${CLIENT_HASH_SECRET+x} == x || ${CRACKLEDATE_IMAGE+x} == x ]]; then
  printf 'verifier leaked an inherited environment variable to Docker\n' >&2
  exit 91
fi

expected=(
  compose
  --env-file /dev/null
  -f "$subject/docker-compose.yml"
  --project-directory "$subject"
  --project-name crackledate-verifier
  config
  --quiet
)
if [[ $# -ne ${#expected[@]} ]]; then
  printf 'unexpected Docker argument count\n' >&2
  exit 92
fi
for ((index = 0; index < ${#expected[@]}; index++)); do
  position=$((index + 1))
  if [[ "${!position}" != "${expected[$index]}" ]]; then
    printf 'unexpected Docker invocation\n' >&2
    exit 93
  fi
done
FAKE_DOCKER
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

run_verifier() {
  local subject="$1"
  env -i \
    PATH="$subject/bin:/usr/bin:/bin" \
    HOME="$subject/home" \
    LEAK_SENTINEL='must-not-reach-docker' \
    CLIENT_HASH_SECRET='must-not-reach-docker' \
    CRACKLEDATE_IMAGE='must-not-reach-docker' \
    "$subject/scripts/verify_compose.sh"
}

expect_pass() {
  local subject="$1"
  if ! run_verifier "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected compose verifier success for %s\n' "$subject" >&2
    exit 1
  fi
  if [[ -s "$subject/stdout" ]]; then
    printf 'compose verifier must not write stdout\n' >&2
    exit 1
  fi
  if [[ -s "$subject/stderr" ]]; then
    printf 'compose verifier must not write stderr on success\n' >&2
    exit 1
  fi
  if [[ "$(wc -l <"$subject/docker-calls.log" | tr -d ' ')" != 1 ]]; then
    printf 'compose verifier must invoke Docker exactly once\n' >&2
    exit 1
  fi
  if ! rg -Fxq -- 'compose --env-file /dev/null -f '"$subject"'/docker-compose.yml --project-directory '"$subject"' --project-name crackledate-verifier config --quiet' "$subject/docker-calls.log"; then
    printf 'compose verifier used an outputting or unexpected Docker command\n' >&2
    exit 1
  fi
}

expect_fail() {
  local subject="$1"
  if run_verifier "$subject" >"$subject/stdout" 2>"$subject/stderr"; then
    printf 'expected compose verifier failure for %s\n' "$subject" >&2
    exit 1
  fi
  if rg -q 'must-not-reach-docker' "$subject/stdout" "$subject/stderr" "$subject/docker-calls.log" 2>/dev/null; then
    printf 'compose verifier exposed an inherited value\n' >&2
    exit 1
  fi
}

subject="$(new_subject valid)"
expect_pass "$subject"

required_lines=(
  '    image: "${CRACKLEDATE_IMAGE:-crackledate-web:local}"'
  '    build:'
  '      context: .'
  '    restart: "${CRACKLEDATE_RESTART_POLICY:-unless-stopped}"'
  '      CLIENT_HASH_SECRET: "${CLIENT_HASH_SECRET:-}"'
  '      SUBMISSIONS_PATH: "${SUBMISSIONS_PATH:-/data/submissions.db}"'
  '      TRUSTED_PROXY_CIDRS: "${TRUSTED_PROXY_CIDRS:-}"'
  '      TRUSTED_CLOUDFLARE_PROXY_CIDRS: "${TRUSTED_CLOUDFLARE_PROXY_CIDRS:-}"'
  '      MAX_CONCURRENT_HINT_SOLVES: "${MAX_CONCURRENT_HINT_SOLVES:-}"'
  '      RETIRE_LEGACY_ACCOUNT_DATA: "${RETIRE_LEGACY_ACCOUNT_DATA:-}"'
  '      - submissions:/data'
  '  submissions:'
  '    name: ${CRACKLEDATE_SUBMISSIONS_VOLUME:-${COMPOSE_PROJECT_NAME:-crackledate-web}_submissions}'
)

index=0
for line in "${required_lines[@]}"; do
  subject="$(new_subject "remove-$index")"
  awk -v remove="$line" '$0 != remove { print }' "$subject/docker-compose.yml" >"$subject/docker-compose.yml.next"
  mv "$subject/docker-compose.yml.next" "$subject/docker-compose.yml"
  expect_fail "$subject"
  index=$((index + 1))
done

mutations=(
  's|CRACKLEDATE_IMAGE:-crackledate-web:local|CRACKLEDATE_IMAGE:-latest|'
  's|CRACKLEDATE_RESTART_POLICY:-unless-stopped|CRACKLEDATE_RESTART_POLICY:-always|'
  's|TRUSTED_PROXY_CIDRS:-}|TRUSTED_PROXY_CIDRS:-0.0.0.0/0}|'
  's|TRUSTED_CLOUDFLARE_PROXY_CIDRS:-}|TRUSTED_CLOUDFLARE_PROXY_CIDRS:-0.0.0.0/0}|'
  's|MAX_CONCURRENT_HINT_SOLVES:-}|MAX_CONCURRENT_HINT_SOLVES:-8}|'
  's|RETIRE_LEGACY_ACCOUNT_DATA:-}|RETIRE_LEGACY_ACCOUNT_DATA:-confirmed}|'
  's|SUBMISSIONS_PATH:-/data/submissions.db|SUBMISSIONS_PATH:-/tmp/submissions.db|'
  's|COMPOSE_PROJECT_NAME:-crackledate-web|COMPOSE_PROJECT_NAME:-production|'
  's|CRACKLEDATE_SUBMISSIONS_VOLUME:-|CRACKLEDATE_SUBMISSIONS_VOLUME:-production_data|'
  's|restart: "${CRACKLEDATE_RESTART_POLICY:-unless-stopped}"|restart: ${CRACKLEDATE_RESTART_POLICY:-unless-stopped}|'
)

index=0
for mutation in "${mutations[@]}"; do
  subject="$(new_subject "change-$index")"
  sed "$mutation" "$subject/docker-compose.yml" >"$subject/docker-compose.yml.next"
  mv "$subject/docker-compose.yml.next" "$subject/docker-compose.yml"
  expect_fail "$subject"
  index=$((index + 1))
done

malicious_additions=(
  '    container_name: crackledate-site'
  '    env_file: .env'
  '      CLIENT_HASH_SECRET: embedded-secret'
  '      RETIRE_LEGACY_ACCOUNT_DATA: confirmed'
  '      - /srv/production:/data'
  '      - ./.env:/run/config:ro'
  '  attacker-service:'
  '    image: attacker:latest'
  '    name: production_submissions'
)

index=0
for addition in "${malicious_additions[@]}"; do
  subject="$(new_subject "malicious-$index")"
  printf '%s\n' "$addition" >>"$subject/docker-compose.yml"
  expect_fail "$subject"
  index=$((index + 1))
done

# Exercise real Compose interpolation without rendering configuration. The exact
# volume expression is paired with a numeric validation sentinel that uses the
# same override/project/default precedence. A nonnumeric project must fail the
# replicas validation unless the explicit volume override wins.
precedence_subject="$scratch/real-compose-precedence"
mkdir -p "$precedence_subject"
cat >"$precedence_subject/compose.yml" <<'COMPOSE'
services:
  probe:
    image: scratch
    deploy:
      replicas: ${CRACKLEDATE_SUBMISSIONS_VOLUME:-${COMPOSE_PROJECT_NAME:-not-a-number}}
    volumes:
      - submissions:/data
volumes:
  submissions:
    name: ${CRACKLEDATE_SUBMISSIONS_VOLUME:-${COMPOSE_PROJECT_NAME:-crackledate-web}_submissions}
COMPOSE

real_docker="$(command -v docker)"
real_compose_env=(
  env -i
  "PATH=${PATH:-/usr/local/bin:/usr/bin:/bin}"
  "HOME=${HOME:-/nonexistent}"
  COMPOSE_DISABLE_ENV_FILE=1
)
if [[ -n ${DOCKER_CONFIG:-} ]]; then
  real_compose_env+=("DOCKER_CONFIG=$DOCKER_CONFIG")
fi

"${real_compose_env[@]}" "$real_docker" compose \
  --env-file /dev/null \
  -f "$precedence_subject/compose.yml" \
  --project-directory "$precedence_subject" \
  --project-name 2 \
  config --quiet

if "${real_compose_env[@]}" "$real_docker" compose \
  --env-file /dev/null \
  -f "$precedence_subject/compose.yml" \
  --project-directory "$precedence_subject" \
  --project-name project-derived-invalid \
  config --quiet >/dev/null 2>&1; then
  printf 'real Compose did not inject the explicit project into interpolation\n' >&2
  exit 1
fi

"${real_compose_env[@]}" CRACKLEDATE_SUBMISSIONS_VOLUME=3 "$real_docker" compose \
  --env-file /dev/null \
  -f "$precedence_subject/compose.yml" \
  --project-directory "$precedence_subject" \
  --project-name project-derived-invalid \
  config --quiet

printf 'verify_compose self-tests passed\n'
