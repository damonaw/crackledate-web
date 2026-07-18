#!/bin/bash
set -euo pipefail

safe_path="/usr/local/bin:/usr/bin:/bin"
PATH="$safe_path"
export PATH

failure() {
  printf 'detached submission volume verification failed\n' >&2
  exit 1
}

docker_context=''
docker_host=''
docker_config=''
fingerprint=''
inspection_image=''
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
    --fingerprint) fingerprint="$value" ;;
    --inspection-image) inspection_image="$value" ;;
    *) failure ;;
  esac
  shift 2
done

for option in --docker-context --docker-host --docker-config --fingerprint --inspection-image; do
  [[ "$seen_options" == *" $option "* ]] || failure
done

export LC_ALL=C
for value in "$docker_context" "$docker_host" "$docker_config" "$fingerprint" "$inspection_image"; do
  [[ -n "$value" && "$value" != *[[:cntrl:]]* ]] || failure
done

identifier_pattern='^[A-Za-z0-9][A-Za-z0-9_.-]*$'
[[ "$docker_context" =~ $identifier_pattern ]] || failure
[[ "$docker_host" != *[[:space:]]* ]] || failure
[[ "$inspection_image" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]] || failure

require_physical_directory() {
  local path="$1" physical
  [[ "$path" == /* && -d "$path" && ! -L "$path" ]] || return 1
  physical="$(CDPATH= cd -- "$path" && pwd -P)" || return 1
  [[ "$path" == "$physical" ]]
}

fingerprint_is_private_regular_file() {
  local metadata
  [[ "$fingerprint" == /* && -f "$fingerprint" && ! -L "$fingerprint" ]] || return 1
  [[ "$fingerprint" == "$(CDPATH= cd -- "$(dirname -- "$fingerprint")" && pwd -P)/$(basename -- "$fingerprint")" ]] || return 1
  if stat -c '%a' "$fingerprint" >/dev/null 2>&1; then
    metadata="$(stat -c '%a' "$fingerprint")"
  else
    metadata="$(stat -f '%Lp' "$fingerprint")"
  fi
  [[ "$metadata" == 600 ]]
}

require_physical_directory "$docker_config" || failure
fingerprint_is_private_regular_file || failure

scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-volume-verify.XXXXXX")"
inspection_id=''
cleanup() {
  local status=$?
  if [[ -n "$inspection_id" ]]; then
    "${docker_env[@]}" docker --context "$docker_context" container rm --force "$inspection_id" >/dev/null 2>/dev/null || status=1
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT

docker_env=(
  /usr/bin/env -i
  "PATH=$safe_path"
  HOME=/nonexistent
  "DOCKER_CONFIG=$docker_config"
  LC_ALL=C
)

fingerprint_version=''
fingerprint_context=''
fingerprint_host=''
project_name=''
service=''
former_container_id=''
former_mount_destination=''
volume_name=''
volume_driver=''
volume_scope=''
volume_mountpoint=''
volume_created_at=''
volume_label_count=''
seen_fingerprint_keys=' '

set_fingerprint_value() {
  local variable="$1" value="$2" key="$3"
  [[ "$seen_fingerprint_keys" != *" $key "* ]] || failure
  seen_fingerprint_keys+="$key "
  printf -v "$variable" '%s' "$value"
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" == *=* && "$line" != *[[:cntrl:]]* ]] || failure
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    fingerprint_version) set_fingerprint_value fingerprint_version "$value" "$key" ;;
    docker_context) set_fingerprint_value fingerprint_context "$value" "$key" ;;
    docker_host) set_fingerprint_value fingerprint_host "$value" "$key" ;;
    project_name) set_fingerprint_value project_name "$value" "$key" ;;
    service) set_fingerprint_value service "$value" "$key" ;;
    former_container_id) set_fingerprint_value former_container_id "$value" "$key" ;;
    former_mount_destination) set_fingerprint_value former_mount_destination "$value" "$key" ;;
    volume_name) set_fingerprint_value volume_name "$value" "$key" ;;
    volume_driver) set_fingerprint_value volume_driver "$value" "$key" ;;
    volume_scope) set_fingerprint_value volume_scope "$value" "$key" ;;
    volume_mountpoint) set_fingerprint_value volume_mountpoint "$value" "$key" ;;
    volume_created_at) set_fingerprint_value volume_created_at "$value" "$key" ;;
    volume_label_count) set_fingerprint_value volume_label_count "$value" "$key" ;;
    volume_label_???)
      label_index="${key#volume_label_}"
      [[ "$label_index" =~ ^[0-9]{3}$ && ! -e "$scratch/expected-label-$label_index" ]] || failure
      printf '%s\n' "$value" >"$scratch/expected-label-$label_index"
      ;;
    *) failure ;;
  esac
done <"$fingerprint"

for key in fingerprint_version docker_context docker_host project_name service former_container_id \
  former_mount_destination volume_name volume_driver volume_scope volume_mountpoint \
  volume_created_at volume_label_count; do
  [[ "$seen_fingerprint_keys" == *" $key "* ]] || failure
done
[[ "$fingerprint_version" == 1 && "$fingerprint_context" == "$docker_context" && "$fingerprint_host" == "$docker_host" ]] || failure
[[ "$project_name" =~ ^[a-z0-9][a-z0-9_-]*$ && "$service" =~ $identifier_pattern ]] || failure
[[ "$former_container_id" =~ ^[0-9a-f]{64}$ && "$former_mount_destination" == /data ]] || failure
[[ "$volume_name" =~ $identifier_pattern && "$volume_label_count" =~ ^[0-9]+$ ]] || failure

expected_label_keys="$scratch/expected-label-keys"
: >"$expected_label_keys"
label_number=0
while [[ "$label_number" -lt "$volume_label_count" ]]; do
  printf -v label_index '%03d' "$label_number"
  label_file="$scratch/expected-label-$label_index"
  [[ -f "$label_file" ]] || failure
  IFS= read -r label <"$label_file" || failure
  label_key="${label%%=*}"
  label_value="${label#*=}"
  [[ "$label_key" =~ $identifier_pattern && "$label_value" != *[[:cntrl:]]* ]] || failure
  printf '%s\n' "$label_key" >>"$expected_label_keys"
  label_number=$((label_number + 1))
done
for extra_label_file in "$scratch"/expected-label-???; do
  [[ -e "$extra_label_file" ]] || continue
  extra_label_index="${extra_label_file##*-}"
  [[ "$extra_label_index" =~ ^[0-9]{3}$ && 10#$extra_label_index -lt $volume_label_count ]] || failure
done
sort -u "$expected_label_keys" >"$scratch/sorted-expected-label-keys"
cmp -s "$expected_label_keys" "$scratch/sorted-expected-label-keys" || failure

query_to() {
  local destination="$1"
  shift
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$destination" 2>/dev/null || failure
}

query_exact() {
  local expected="$1" destination="$2"
  shift 2
  query_to "$destination" "$@"
  printf '%s\n' "$expected" | cmp -s - "$destination" || failure
}

verify_snapshot() {
  local prefix="$1" label_key expected_label destination label_number=0
  query_exact "$docker_context|$docker_host" "$scratch/$prefix-context" context inspect \
    --format '{{.Name}}|{{.Endpoints.docker.Host}}' "$docker_context"
  query_exact "$volume_name" "$scratch/$prefix-name" volume inspect --format '{{.Name}}' "$volume_name"
  query_exact "$volume_driver" "$scratch/$prefix-driver" volume inspect --format '{{.Driver}}' "$volume_name"
  query_exact "$volume_scope" "$scratch/$prefix-scope" volume inspect --format '{{.Scope}}' "$volume_name"
  query_exact "$volume_mountpoint" "$scratch/$prefix-mountpoint" volume inspect --format '{{.Mountpoint}}' "$volume_name"
  query_exact "$volume_created_at" "$scratch/$prefix-created-at" volume inspect --format '{{.CreatedAt}}' "$volume_name"
  query_exact "$volume_label_count" "$scratch/$prefix-label-count" volume inspect --format '{{len .Labels}}' "$volume_name"
  destination="$scratch/$prefix-label-keys"
  query_to "$destination" volume inspect --format '{{range $key, $_ := .Labels}}{{printf "%s" $key}}{{println}}{{end}}' "$volume_name"
  cmp -s "$expected_label_keys" "$destination" || failure
  while IFS= read -r label_key || [[ -n "$label_key" ]]; do
    IFS= read -r expected_label <"$scratch/expected-label-$(printf '%03d' "$label_number")" || failure
    query_exact "${expected_label#*=}" "$scratch/$prefix-label-$label_number" volume inspect \
      --format "{{index .Labels \"$label_key\"}}" "$volume_name"
    label_number=$((label_number + 1))
  done <"$expected_label_keys"
}

zero_consumers() {
  local destination="$1"
  query_to "$destination" container ls --all --filter "volume=$volume_name" --quiet
  [[ ! -s "$destination" ]] || failure
}

verify_snapshot before
zero_consumers "$scratch/before-consumers"

inspection_name="crackledate-volume-inspect-$$-$RANDOM"
inspection_id="$("${docker_env[@]}" docker --context "$docker_context" container create \
  --name "$inspection_name" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --mount "type=volume,src=$volume_name,dst=/evidence,readonly" \
  "$inspection_image" find /evidence -mindepth 1 -maxdepth 1 -exec stat -c '%n|%F|%h' || failure)"
[[ "$inspection_id" =~ ^[0-9a-f]{64}$ ]] || failure
"${docker_env[@]}" docker --context "$docker_context" container start "$inspection_id" >/dev/null 2>/dev/null || failure
inspection_exit="$("${docker_env[@]}" docker --context "$docker_context" container wait "$inspection_id" 2>/dev/null || failure)"
[[ "$inspection_exit" == 0 ]] || failure
metadata="$scratch/inspection-metadata"
query_to "$metadata" container logs "$inspection_id"
expected_metadata="$scratch/expected-metadata"
printf '%s\n' \
  '/evidence/submissions.db|regular file|1' \
  '/evidence/submissions.db-journal|regular file|1' \
  '/evidence/submissions.db-shm|regular file|1' \
  '/evidence/submissions.db-wal|regular file|1' >"$expected_metadata"
cmp -s "$expected_metadata" "$metadata" || failure

"${docker_env[@]}" docker --context "$docker_context" container rm --force "$inspection_id" >/dev/null 2>/dev/null || failure
inspection_id=''
verify_snapshot after
zero_consumers "$scratch/after-consumers"

printf 'detached submissions volume verified: %s\n' "$volume_name"
