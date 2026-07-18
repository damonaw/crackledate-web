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
fingerprint_fields=(
  fingerprint_version docker_context docker_host project_name service former_container_id
  former_mount_destination volume_name volume_driver volume_scope volume_mountpoint
  volume_created_at volume_label_count
)
fingerprint_field_index=0
label_index_expected=0

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" == *=* && "$line" != *[[:cntrl:]]* ]] || failure
  key="${line%%=*}"
  value="${line#*=}"
  if [[ "$fingerprint_field_index" -lt "${#fingerprint_fields[@]}" ]]; then
    [[ "$key" == "${fingerprint_fields[$fingerprint_field_index]}" ]] || failure
    case "$key" in
      fingerprint_version) fingerprint_version="$value" ;;
      docker_context) fingerprint_context="$value" ;;
      docker_host) fingerprint_host="$value" ;;
      project_name) project_name="$value" ;;
      service) service="$value" ;;
      former_container_id) former_container_id="$value" ;;
      former_mount_destination) former_mount_destination="$value" ;;
      volume_name) volume_name="$value" ;;
      volume_driver) volume_driver="$value" ;;
      volume_scope) volume_scope="$value" ;;
      volume_mountpoint) volume_mountpoint="$value" ;;
      volume_created_at) volume_created_at="$value" ;;
      volume_label_count) volume_label_count="$value" ;;
    esac
    fingerprint_field_index=$((fingerprint_field_index + 1))
  else
    printf -v label_index '%03d' "$label_index_expected"
    [[ "$key" == "volume_label_$label_index" && "$value" == *=* ]] || failure
    label_key="${value%%=*}"
    label_value="${value#*=}"
    [[ "$label_key" =~ $identifier_pattern && "$label_value" != *[[:cntrl:]]* ]] || failure
    printf '%s\n' "$value" >"$scratch/expected-label-$label_index"
    label_index_expected=$((label_index_expected + 1))
  fi
done <"$fingerprint"

[[ "$fingerprint_field_index" == "${#fingerprint_fields[@]}" ]] || failure
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
[[ "$label_index_expected" == "$volume_label_count" ]] || failure
sort -u "$expected_label_keys" >"$scratch/sorted-expected-label-keys"
cmp -s "$expected_label_keys" "$scratch/sorted-expected-label-keys" || failure

query_to() {
  local destination="$1"
  shift
  "${docker_env[@]}" docker --context "$docker_context" "$@" >"$destination" 2>/dev/null || failure
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

query_println_to() {
  local destination="$1"
  shift
  local raw_output="$destination-raw"
  query_to "$raw_output" "$@"
  normalize_println_output "$raw_output" "$destination"
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
  query_println_to "$destination" volume inspect --format '{{range $key, $_ := .Labels}}{{printf "%s" $key}}{{println}}{{end}}' "$volume_name"
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
create_output="$scratch/container-id"
"${docker_env[@]}" docker --context "$docker_context" container create \
  --name "$inspection_name" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --mount "type=volume,src=$volume_name,dst=/evidence,readonly" \
  "$inspection_image" find /evidence -mindepth 1 -maxdepth 1 -exec stat -c '%n|%F|%h' '{}' + \
  >"$create_output" 2>/dev/null || failure
IFS= read -r inspection_id <"$create_output" || failure
printf '%s\n' "$inspection_id" | cmp -s - "$create_output" || failure
[[ "$inspection_id" =~ ^[0-9a-f]{64}$ ]] || failure
"${docker_env[@]}" docker --context "$docker_context" container start "$inspection_id" >/dev/null 2>/dev/null || failure
inspection_exit="$("${docker_env[@]}" docker --context "$docker_context" container wait "$inspection_id" 2>/dev/null || failure)"
[[ "$inspection_exit" == 0 ]] || failure
metadata="$scratch/inspection-metadata"
query_to "$metadata" container logs "$inspection_id"
seen_submissions_db=false
seen_submissions_db_journal=false
seen_submissions_db_shm=false
seen_submissions_db_wal=false
while IFS= read -r record || [[ -n "$record" ]]; do
  [[ -n "$record" && "$record" != *[[:cntrl:]]* && "$record" == *'|'* ]] || failure
  metadata_path="${record%%|*}"
  remainder="${record#*|}"
  [[ "$remainder" == *'|'* ]] || failure
  metadata_type="${remainder%%|*}"
  metadata_links="${remainder#*|}"
  [[ "$metadata_links" != *'|'* && "$metadata_type" == 'regular file' && "$metadata_links" == 1 ]] || failure
  case "$metadata_path" in
    /evidence/submissions.db)
      [[ "$seen_submissions_db" == false ]] || failure
      seen_submissions_db=true
      ;;
    /evidence/submissions.db-journal)
      [[ "$seen_submissions_db_journal" == false ]] || failure
      seen_submissions_db_journal=true
      ;;
    /evidence/submissions.db-shm)
      [[ "$seen_submissions_db_shm" == false ]] || failure
      seen_submissions_db_shm=true
      ;;
    /evidence/submissions.db-wal)
      [[ "$seen_submissions_db_wal" == false ]] || failure
      seen_submissions_db_wal=true
      ;;
    *) failure ;;
  esac
done <"$metadata"
[[ "$seen_submissions_db" == true ]] || failure

"${docker_env[@]}" docker --context "$docker_context" container rm --force "$inspection_id" >/dev/null 2>/dev/null || failure
inspection_id=''
verify_snapshot after
zero_consumers "$scratch/after-consumers"

printf 'detached submissions volume verified: %s\n' "$volume_name"
