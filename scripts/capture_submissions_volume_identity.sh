#!/bin/bash
set -euo pipefail

safe_path="/usr/local/bin:/usr/bin:/bin"
PATH="$safe_path"
export PATH

failure() {
  printf 'submission volume fingerprint capture failed\n' >&2
  exit 1
}

docker_context=''
docker_host=''
docker_config=''
project_name=''
service=''
container_id=''
volume=''
output=''
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
    --project-name) project_name="$value" ;;
    --service) service="$value" ;;
    --container-id) container_id="$value" ;;
    --volume) volume="$value" ;;
    --output) output="$value" ;;
    *) failure ;;
  esac
  shift 2
done

required_options=(
  --docker-context --docker-host --docker-config --project-name --service
  --container-id --volume --output
)
for option in "${required_options[@]}"; do
  [[ "$seen_options" == *" $option "* ]] || failure
done

export LC_ALL=C
values=(
  "$docker_context" "$docker_host" "$docker_config" "$project_name"
  "$service" "$container_id" "$volume" "$output"
)
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
[[ "$container_id" =~ ^[0-9a-f]{64}$ ]] || failure

require_physical_directory() {
  local path="$1"
  local physical
  [[ "$path" == /* && -d "$path" && ! -L "$path" ]] || return 1
  physical="$(CDPATH= cd -- "$path" && pwd -P)" || return 1
  [[ "$path" == "$physical" ]]
}

physical_new_file_path() {
  local path="$1"
  local parent base physical_parent
  [[ "$path" == /* ]] || return 1
  parent="$(dirname -- "$path")"
  base="$(basename -- "$path")"
  [[ "$base" != . && "$base" != .. ]] || return 1
  physical_parent="$(CDPATH= cd -- "$parent" && pwd -P)" || return 1
  if [[ "$physical_parent" == / ]]; then
    printf '/%s\n' "$base"
  else
    printf '%s/%s\n' "$physical_parent" "$base"
  fi
}

require_physical_directory "$docker_config" || failure
[[ "$output" == "$(physical_new_file_path "$output")" ]] || failure
[[ ! -e "$output" && ! -L "$output" ]] || failure

docker_env=(
  /usr/bin/env -i
  "PATH=$safe_path"
  HOME=/nonexistent
  "DOCKER_CONFIG=$docker_config"
  LC_ALL=C
)

scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-volume-capture.XXXXXX")"
remove_output=false
output_metadata=''
output_fd_metadata=''
output_matches_fd() {
  local path="$1"
  local metadata
  [[ -f "$path" && ! -L "$path" ]] || return 1
  if stat -f '%l|%Lp|%i' "$path" >/dev/null 2>&1; then
    metadata="$(stat -f '%l|%Lp|%i' "$path")" || return 1
  else
    metadata="$(stat -c '%h|%a|%i' "$path")" || return 1
  fi
  [[ "$metadata" == "1|600|$output_fd_metadata" ]]
}
cleanup() {
  rm -rf -- "$scratch"
  if [[ "$remove_output" == true ]] && output_matches_fd "$output"; then
    rm -f -- "$output"
  fi
}
trap cleanup EXIT

query_to() {
  local destination="$1"
  shift
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$destination" 2>/dev/null || failure
}

query_exact() {
  local name="$1"
  local expected="$2"
  shift 2
  local destination="$scratch/$name"
  query_to "$destination" "$@"
  printf '%s\n' "$expected" | cmp -s - "$destination" || failure
}

query_value() {
  local variable_name="$1"
  local name="$2"
  shift 2
  local destination="$scratch/$name"
  local value
  query_to "$destination" "$@"
  IFS= read -r value <"$destination" || failure
  [[ -n "$value" && "$value" != *[[:cntrl:]]* ]] || failure
  printf '%s\n' "$value" | cmp -s - "$destination" || failure
  printf -v "$variable_name" '%s' "$value"
}

query_label_value() {
  local variable_name="$1"
  local name="$2"
  shift 2
  local destination="$scratch/$name"
  local value
  query_to "$destination" "$@"
  IFS= read -r value <"$destination" || failure
  [[ "$value" != *[[:cntrl:]]* ]] || failure
  printf '%s\n' "$value" | cmp -s - "$destination" || failure
  printf -v "$variable_name" '%s' "$value"
}

query_exact context "$docker_context|$docker_host" context inspect \
  --format '{{.Name}}|{{.Endpoints.docker.Host}}' "$docker_context"

query_exact container-id "$container_id" container inspect \
  --format '{{.Id}}' "$container_id"
query_exact container-project "$project_name" container inspect \
  --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id"
query_exact container-service "$service" container inspect \
  --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id"
query_exact container-mount "volume|$volume|/data" container inspect \
  --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}{{end}}' \
  "$container_id"

query_value volume_name volume-name volume inspect --format '{{.Name}}' "$volume"
[[ "$volume_name" == "$volume" ]] || failure
query_value volume_driver volume-driver volume inspect --format '{{.Driver}}' "$volume"
query_value volume_scope volume-scope volume inspect --format '{{.Scope}}' "$volume"
query_value volume_mountpoint volume-mountpoint volume inspect --format '{{.Mountpoint}}' "$volume"
query_value volume_created_at volume-created-at volume inspect --format '{{.CreatedAt}}' "$volume"
query_exact volume-project "$project_name" volume inspect \
  --format '{{index .Labels "com.docker.compose.project"}}' "$volume"
query_exact volume-logical-key submissions volume inspect \
  --format '{{index .Labels "com.docker.compose.volume"}}' "$volume"

query_value label_count volume-label-count volume inspect --format '{{len .Labels}}' "$volume"
[[ "$label_count" =~ ^[0-9]+$ ]] || failure

label_keys="$scratch/label-keys"
sorted_label_keys="$scratch/sorted-label-keys"
query_to "$label_keys" volume inspect \
  --format '{{range $key, $_ := .Labels}}{{printf "%s" $key}}{{println}}{{end}}' "$volume"
while IFS= read -r label_key || [[ -n "$label_key" ]]; do
  [[ "$label_key" =~ $identifier_pattern ]] || failure
done <"$label_keys"
sort -u "$label_keys" >"$sorted_label_keys"
cmp -s "$label_keys" "$sorted_label_keys" || failure
returned_label_count="$(wc -l <"$sorted_label_keys" | tr -d ' ')"
[[ "$returned_label_count" == "$label_count" ]] || failure

labels="$scratch/labels"
: >"$labels"
while IFS= read -r label_key || [[ -n "$label_key" ]]; do
  label_value=''
  query_label_value label_value "label-${label_key}" volume inspect \
    --format "{{index .Labels \"$label_key\"}}" "$volume"
  printf '%s=%s\n' "$label_key" "$label_value" >>"$labels"
done <"$sorted_label_keys"

fingerprint="$scratch/fingerprint"
{
  printf 'fingerprint_version=1\n'
  printf 'docker_context=%s\n' "$docker_context"
  printf 'docker_host=%s\n' "$docker_host"
  printf 'project_name=%s\n' "$project_name"
  printf 'service=%s\n' "$service"
  printf 'former_container_id=%s\n' "$container_id"
  printf 'former_mount_destination=/data\n'
  printf 'volume_name=%s\n' "$volume_name"
  printf 'volume_driver=%s\n' "$volume_driver"
  printf 'volume_scope=%s\n' "$volume_scope"
  printf 'volume_mountpoint=%s\n' "$volume_mountpoint"
  printf 'volume_created_at=%s\n' "$volume_created_at"
  printf 'volume_label_count=%s\n' "$label_count"
  label_index=0
  while IFS= read -r label || [[ -n "$label" ]]; do
    printf 'volume_label_%03d=%s\n' "$label_index" "$label"
    label_index=$((label_index + 1))
  done <"$labels"
} >"$fingerprint"

require_physical_directory "$docker_config" || failure
[[ "$output" == "$(physical_new_file_path "$output")" ]] || failure
[[ ! -e "$output" && ! -L "$output" ]] || failure
umask 077
set -o noclobber
exec 3>"$output" || failure
set +o noclobber
remove_output=true
if stat -f '%i' /dev/fd/3 >/dev/null 2>&1; then
  output_fd_metadata="$(stat -f '%i' /dev/fd/3)" || failure
else
  output_fd_metadata="$(stat -c '%i' /dev/fd/3)" || failure
fi
output_matches_fd "$output" || failure
cat "$fingerprint" >&3 || failure
output_matches_fd "$output" || failure
exec 3>&-
remove_output=false

printf 'submission volume fingerprint captured\n'
