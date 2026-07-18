#!/usr/bin/env bash
set -euo pipefail

failure() {
  printf 'deployment identity verification failed\n' >&2
  exit 1
}

trap failure ERR

docker_context=''
docker_host=''
docker_config=''
env_file=''
compose_file=''
project_directory=''
project_name=''
service=''
container_id=''
image_id=''
revision=''
volume=''
restart_policy=''
retirement_state=''
expected_state=''
phase=''
seen_options=' '

while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || failure
  option="$1"
  value="$2"
  [[ "$seen_options" != *" $option "* ]] || failure
  seen_options+="$option "
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
    --volume) volume="$value" ;;
    --restart-policy) restart_policy="$value" ;;
    --retirement-state) retirement_state="$value" ;;
    --expected-state) expected_state="$value" ;;
    --phase) phase="$value" ;;
    *) failure ;;
  esac
  shift 2
done

required_options=(
  --docker-context --docker-host --docker-config --env-file --compose-file
  --project-directory --project-name --service --container-id --image-id
  --revision --volume --restart-policy --retirement-state --expected-state --phase
)
for option in "${required_options[@]}"; do
  [[ "$seen_options" == *" $option "* ]] || failure
done

values=(
  "$docker_context" "$docker_host" "$docker_config" "$env_file" "$compose_file"
  "$project_directory" "$project_name" "$service" "$container_id" "$image_id"
  "$revision" "$volume" "$restart_policy" "$retirement_state" "$expected_state" "$phase"
)
LC_ALL=C
for value in "${values[@]}"; do
  [[ -n "$value" && "$value" != *[[:cntrl:]]* ]] || failure
done

identifier_pattern='^[A-Za-z0-9][A-Za-z0-9_.-]*$'
project_pattern='^[a-z0-9][a-z0-9_-]*$'
host_pattern='^[A-Za-z0-9][A-Za-z0-9_.:/@%+?=,&-]*$'
docker_host_without_brackets="$(printf '%s' "$docker_host" | tr -d '[]')"
[[ "$docker_context" =~ $identifier_pattern ]] || failure
[[ "$docker_host_without_brackets" =~ $host_pattern && "$docker_host" != *[[:space:]]* ]] || failure
[[ "$project_name" =~ $project_pattern ]] || failure
[[ "$service" =~ $identifier_pattern ]] || failure
[[ "$volume" =~ $identifier_pattern ]] || failure
[[ "$container_id" =~ ^[[:xdigit:]]{64}$ ]] || failure
[[ "$image_id" =~ ^sha256:[[:xdigit:]]{64}$ ]] || failure
[[ "$revision" =~ ^[[:xdigit:]]{40,64}$ ]] || failure
case "$restart_policy" in
  no|always|unless-stopped|on-failure) ;;
  *) failure ;;
esac
[[ "$retirement_state" == empty || "$retirement_state" == confirmed ]] || failure
[[ "$expected_state" == stopped || "$expected_state" == running ]] || failure
case "$phase" in
  normal|confirmed-prestart|confirmed-post-start-verification) ;;
  *) failure ;;
esac

if [[ "$retirement_state" == confirmed ]]; then
  [[ "$restart_policy" == no ]] || failure
  if [[ "$phase" == confirmed-prestart ]]; then
    [[ "$expected_state" == stopped ]] || failure
  elif [[ "$phase" == confirmed-post-start-verification ]]; then
    [[ "$expected_state" == running ]] || failure
  else
    failure
  fi
else
  [[ "$phase" == normal ]] || failure
fi

physical_file_path() {
  local path="$1"
  local parent base physical_parent
  parent="$(dirname -- "$path")"
  base="$(basename -- "$path")"
  physical_parent="$({ CDPATH= cd -- "$parent" && pwd -P; } 2>/dev/null)" || return 1
  if [[ "$physical_parent" == / ]]; then
    printf '/%s\n' "$base"
  else
    printf '%s/%s\n' "$physical_parent" "$base"
  fi
}

require_regular_file_path() {
  local path="$1"
  [[ "$path" == /* && "$path" == "$(physical_file_path "$path")" ]] || failure
  [[ -f "$path" && ! -L "$path" ]] || failure
  [[ "$(portable_link_count "$path")" == 1 ]] || failure
}

require_directory_path() {
  local path="$1"
  local physical
  [[ "$path" == /* && -d "$path" && ! -L "$path" ]] || failure
  physical="$({ CDPATH= cd -- "$path" && pwd -P; } 2>/dev/null)" || failure
  [[ "$path" == "$physical" ]] || failure
}

if stat -f '%d:%i:%l:%u:%g:%p:%z:%m' "$env_file" >/dev/null 2>&1; then
  stat_style=bsd
else
  stat_style=gnu
fi

portable_link_count() {
  local path="$1"
  if [[ "$stat_style" == bsd ]]; then
    stat -f '%l' -- "$path" 2>/dev/null
  else
    stat -c '%h' -- "$path" 2>/dev/null
  fi
}

portable_identity() {
  local path="$1"
  if [[ "$stat_style" == bsd ]]; then
    stat -f '%d:%i:%l:%u:%g:%p:%z:%m' -- "$path" 2>/dev/null
  else
    stat -c '%d:%i:%h:%u:%g:%f:%s:%Y' -- "$path" 2>/dev/null
  fi
}

require_directory_path "$docker_config"
require_regular_file_path "$env_file"
require_directory_path "$project_directory"
require_regular_file_path "$compose_file"
[[ "$compose_file" == "$project_directory/"* ]] || failure

docker_config_identity="$(portable_identity "$docker_config")" || failure
env_file_identity="$(portable_identity "$env_file")" || failure
project_directory_identity="$(portable_identity "$project_directory")" || failure
compose_file_identity="$(portable_identity "$compose_file")" || failure

safe_path="${PATH:-/usr/local/bin:/usr/bin:/bin}"
docker_env=(
  env -i
  "PATH=$safe_path"
  HOME=/nonexistent
  "DOCKER_CONFIG=$docker_config"
  COMPOSE_DISABLE_ENV_FILE=1
)

scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-identity.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

query_exact() {
  local name="$1"
  local expected="$2"
  shift 2
  local output="$scratch/$name"
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$output" 2>/dev/null || failure
  printf '%s\n' "$expected" | cmp -s - "$output" || failure
}

normalize_println_output() {
  local source="$1"
  local destination="$2"
  local line=''
  local previous=''
  local saw_line=false
  : >"$destination"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$saw_line" == true ]]; then
      printf '%s\n' "$previous" >>"$destination"
    fi
    previous="$line"
    saw_line=true
  done <"$source"
  [[ "$saw_line" == true && -z "$previous" ]] || failure
}

query_println_exact() {
  local name="$1"
  local expected="$2"
  shift 2
  local raw_output="$scratch/$name-raw"
  local output="$scratch/$name"
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$raw_output" 2>/dev/null || failure
  normalize_println_output "$raw_output" "$output"
  printf '%s\n' "$expected" | cmp -s - "$output" || failure
}

query_exact context "$docker_context|$docker_host" context inspect \
  --format '{{.Name}}|{{.Endpoints.docker.Host}}' "$docker_context"

compose_container_output="$scratch/compose-container"
"${docker_env[@]}" docker --context "$docker_context" compose \
  --env-file "$env_file" \
  -f "$compose_file" \
  --project-directory "$project_directory" \
  --project-name "$project_name" \
  ps --all --quiet "$service" >"$compose_container_output" 2>/dev/null || failure
printf '%s\n' "$container_id" | cmp -s - "$compose_container_output" || failure

query_exact project "$project_name" container inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id"
query_exact service "$service" container inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id"
query_exact working-directory "$project_directory" container inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container_id"
query_exact config-file "$compose_file" container inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$container_id"
query_exact container-id "$container_id" container inspect --format '{{.Id}}' "$container_id"
query_exact image-id "$image_id" container inspect --format '{{.Image}}' "$container_id"
query_exact revision "$revision" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id"
query_println_exact mount "volume|$volume|/data" container inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}{{end}}' "$container_id"
query_println_exact submissions-path exact container inspect --format '{{range .Config.Env}}{{if eq (printf "%.17s" .) "SUBMISSIONS_PATH="}}{{if eq . "SUBMISSIONS_PATH=/data/submissions.db"}}exact{{else}}invalid{{end}}{{println}}{{end}}{{end}}' "$container_id"
query_println_exact secret-state present-nonempty container inspect --format '{{range .Config.Env}}{{if eq (printf "%.19s" .) "CLIENT_HASH_SECRET="}}{{if gt (len .) 19}}present-nonempty{{else}}present-empty{{end}}{{println}}{{end}}{{end}}' "$container_id"
query_println_exact retirement "$retirement_state" container inspect --format '{{range .Config.Env}}{{if eq (printf "%.27s" .) "RETIRE_LEGACY_ACCOUNT_DATA="}}{{if eq . "RETIRE_LEGACY_ACCOUNT_DATA="}}empty{{else if eq . "RETIRE_LEGACY_ACCOUNT_DATA=confirmed"}}confirmed{{else}}invalid{{end}}{{println}}{{end}}{{end}}' "$container_id"
query_exact restart-policy "$restart_policy" container inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id"
state_format='{{if eq .State.Status "running"}}running{{else if or (eq .State.Status "created") (eq .State.Status "exited")}}stopped{{else}}invalid{{end}}'
query_exact state "$expected_state" container inspect --format "$state_format" "$container_id"

consumers_output="$scratch/consumers"
"${docker_env[@]}" docker --context "$docker_context" container ls \
  --all --no-trunc --filter "volume=$volume" --format '{{.ID}}' >"$consumers_output" 2>/dev/null || failure

consumer_count=0
while IFS= read -r consumer || [[ -n "$consumer" ]]; do
  [[ -n "$consumer" && "$consumer" =~ ^[[:xdigit:]]{64}$ ]] || failure
  consumer_count=$((consumer_count + 1))
  consumer_state="$scratch/consumer-state-$consumer_count"
  "${docker_env[@]}" docker --context "$docker_context" container inspect \
    --format "$state_format" "$consumer" >"$consumer_state" 2>/dev/null || failure
  if [[ "$consumer" != "$container_id" ]]; then
    if printf 'running\n' | cmp -s - "$consumer_state"; then
      failure
    fi
    printf 'stopped\n' | cmp -s - "$consumer_state" || failure
    failure
  fi
  printf '%s\n' "$expected_state" | cmp -s - "$consumer_state" || failure
done <"$consumers_output"
[[ $consumer_count -eq 1 ]] || failure

require_directory_path "$docker_config"
require_regular_file_path "$env_file"
require_directory_path "$project_directory"
require_regular_file_path "$compose_file"
[[ "$compose_file" == "$project_directory/"* ]] || failure
[[ "$(portable_identity "$docker_config")" == "$docker_config_identity" ]] || failure
[[ "$(portable_identity "$env_file")" == "$env_file_identity" ]] || failure
[[ "$(portable_identity "$project_directory")" == "$project_directory_identity" ]] || failure
[[ "$(portable_identity "$compose_file")" == "$compose_file_identity" ]] || failure

printf 'deployment identity verified\n'
