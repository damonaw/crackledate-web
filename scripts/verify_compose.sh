#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"

expected_compose=(
  'services:'
  '  crackledate-site:'
  '    image: "${CRACKLEDATE_IMAGE:-crackledate-web:local}"'
  '    build:'
  '      context: .'
  '    restart: "${CRACKLEDATE_RESTART_POLICY:-unless-stopped}"'
  '    ports:'
  '      - "127.0.0.1:8082:8080"'
  '    environment:'
  '      TRUSTED_PROXY_CIDRS: "${TRUSTED_PROXY_CIDRS:-}"'
  '      TRUSTED_CLOUDFLARE_PROXY_CIDRS: "${TRUSTED_CLOUDFLARE_PROXY_CIDRS:-}"'
  '      MAX_CONCURRENT_HINT_SOLVES: "${MAX_CONCURRENT_HINT_SOLVES:-}"'
)

actual_compose=()
while IFS= read -r line || [[ -n "$line" ]]; do
  actual_compose+=("$line")
done <"$repo_dir/docker-compose.yml"

if [[ ${#actual_compose[@]} -ne ${#expected_compose[@]} ]]; then
  printf 'docker-compose.yml is not the reviewed exact policy\n' >&2
  exit 1
fi
for ((index = 0; index < ${#expected_compose[@]}; index++)); do
  if [[ "${actual_compose[$index]}" != "${expected_compose[$index]}" ]]; then
    printf 'docker-compose.yml is not the reviewed exact policy\n' >&2
    exit 1
  fi
done

safe_path="${PATH:-/usr/local/bin:/usr/bin:/bin}"
docker_env=(
  env -i
  "PATH=$safe_path"
  "HOME=${HOME:-/nonexistent}"
  COMPOSE_DISABLE_ENV_FILE=1
)
if [[ -n ${DOCKER_CONFIG:-} ]]; then
  docker_env+=("DOCKER_CONFIG=$DOCKER_CONFIG")
fi

"${docker_env[@]}" docker compose \
  --env-file /dev/null \
  -f "$repo_dir/docker-compose.yml" \
  --project-directory "$repo_dir" \
  --project-name crackledate-verifier \
  config --quiet
