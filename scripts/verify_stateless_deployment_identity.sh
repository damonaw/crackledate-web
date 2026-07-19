#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'stateless deployment identity verification failed\n' >&2
  exit 1
}
trap fail ERR

docker_context='' docker_host='' docker_config='' env_file='' compose_file=''
project_directory='' project_name='' service='' container_id='' image_id=''
revision='' restart_policy='' expected_state=''
seen=' '
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || fail
  option="$1" value="$2"
  [[ "$seen" != *" $option "* ]] || fail
  seen+="$option "
  case "$option" in
    --docker-context) docker_context="$value" ;;
    --docker-host) docker_host="$value" ;;
    --docker-config) docker_config="$value" ;;
    --env-file) env_file="$value" ;;
    --compose-file) compose_file="$value" ;;
    --project-directory) project_directory="$value" ;;
    --project-name) project_name="$value" ;;
    --service) service="$value" ;;
    --container-id) container_id="$value" ;;
    --image-id) image_id="$value" ;;
    --revision) revision="$value" ;;
    --restart-policy) restart_policy="$value" ;;
    --expected-state) expected_state="$value" ;;
    *) fail ;;
  esac
  shift 2
done

required=(--docker-context --docker-host --docker-config --env-file --compose-file --project-directory --project-name --service --container-id --image-id --revision --restart-policy --expected-state)
for option in "${required[@]}"; do [[ "$seen" == *" $option "* ]] || fail; done
for value in "$docker_context" "$docker_host" "$docker_config" "$env_file" "$compose_file" "$project_directory" "$project_name" "$service" "$container_id" "$image_id" "$revision" "$restart_policy" "$expected_state"; do
  [[ -n "$value" && "$value" != *[[:cntrl:]]* ]] || fail
done
[[ "$container_id" =~ ^[[:xdigit:]]{64}$ ]] || fail
[[ "$image_id" =~ ^sha256:[[:xdigit:]]{64}$ ]] || fail
[[ "$revision" =~ ^[[:xdigit:]]{40,64}$ ]] || fail
[[ "$restart_policy" == no || "$restart_policy" == unless-stopped ]] || fail
[[ "$expected_state" == running || "$expected_state" == stopped ]] || fail
[[ -d "$docker_config" && ! -L "$docker_config" ]] || fail
[[ -d "$project_directory" && ! -L "$project_directory" ]] || fail
[[ -f "$env_file" && ! -L "$env_file" ]] || fail
[[ -f "$compose_file" && ! -L "$compose_file" && "$compose_file" == "$project_directory/"* ]] || fail

safe_path="${PATH:-/usr/local/bin:/usr/bin:/bin}"
docker_env=(env -i "PATH=$safe_path" HOME=/nonexistent "DOCKER_CONFIG=$docker_config" COMPOSE_DISABLE_ENV_FILE=1)
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-stateless-identity.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

query() {
  local name="$1" expected="$2"
  shift 2
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$scratch/$name" 2>/dev/null || fail
  printf '%s\n' "$expected" | cmp -s - "$scratch/$name" || fail
}

query context "$docker_context|$docker_host" context inspect --format '{{.Name}}|{{.Endpoints.docker.Host}}' "$docker_context"
"${docker_env[@]}" docker --context "$docker_context" compose --env-file "$env_file" -f "$compose_file" --project-directory "$project_directory" --project-name "$project_name" ps --all --quiet "$service" >"$scratch/compose" 2>/dev/null || fail
printf '%s\n' "$container_id" | cmp -s - "$scratch/compose" || fail
query project "$project_name" container inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id"
query service "$service" container inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id"
query working-dir "$project_directory" container inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container_id"
query config-file "$compose_file" container inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$container_id"
query container "$container_id" container inspect --format '{{.Id}}' "$container_id"
query image "$image_id" container inspect --format '{{.Image}}' "$container_id"
query revision "$revision" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id"
query mounts 0 container inspect --format '{{len .Mounts}}' "$container_id"
query restart "$restart_policy" container inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id"
query state "$expected_state" container inspect --format '{{.State.Status}}' "$container_id"

"${docker_env[@]}" docker --context "$docker_context" container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" >"$scratch/env" 2>/dev/null || fail
if grep -Eq '^(SUBMISSIONS_PATH|CLIENT_HASH_SECRET|RETIRE_LEGACY_ACCOUNT_DATA)=' "$scratch/env"; then fail; fi

"${docker_env[@]}" docker --context "$docker_context" exec "$container_id" sh -eu -c \
  'test -x /app/crackledate-web; test ! -e /app/submissions-audit; test ! -e /app/submissions-reconcile; test ! -e /data; ! find /app -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) -print -quit | grep -q .' \
  >/dev/null 2>&1 || fail

printf 'stateless deployment identity verified\n'
