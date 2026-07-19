#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-compose-test.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

new_subject() {
  local name="$1" subject="$scratch/$1"
  mkdir -p "$subject/scripts" "$subject/bin" "$subject/home"
  cp "$repo_dir/docker-compose.yml" "$subject/docker-compose.yml"
  cp "$repo_dir/scripts/verify_compose.sh" "$subject/scripts/verify_compose.sh"
  chmod +x "$subject/scripts/verify_compose.sh"
  cat >"$subject/bin/docker" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
[[ ${LEAK_SENTINEL+x} != x && ${CLIENT_HASH_SECRET+x} != x && ${CRACKLEDATE_IMAGE+x} != x ]]
exit 0
FAKE
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

run() {
  local subject="$1"
  env -i PATH="$subject/bin:/usr/bin:/bin" HOME="$subject/home" \
    LEAK_SENTINEL=private CLIENT_HASH_SECRET=private CRACKLEDATE_IMAGE=private \
    "$subject/scripts/verify_compose.sh" >/dev/null 2>&1
}

valid="$(new_subject valid)"
run "$valid" || { printf 'valid compose rejected\n' >&2; exit 1; }

mutations=(
  '      SUBMISSIONS_PATH: /data/submissions.db'
  '      CLIENT_HASH_SECRET: secret'
  '      RETIRE_LEGACY_ACCOUNT_DATA: confirmed'
  '    volumes:'
  '      - submissions:/data'
  'volumes:'
  '    env_file: .env'
  '    container_name: crackledate-site'
  '  second-service:'
  '    image: attacker:latest'
)
index=0
for mutation in "${mutations[@]}"; do
  subject="$(new_subject "mutation-$index")"
  printf '%s\n' "$mutation" >>"$subject/docker-compose.yml"
  if run "$subject"; then
    printf 'compose mutation accepted: %s\n' "$mutation" >&2
    exit 1
  fi
  index=$((index + 1))
done

printf 'verify_compose self-tests passed\n'
