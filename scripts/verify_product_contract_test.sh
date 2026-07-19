#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
verifier="$script_dir/verify_product_contract.sh"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-product-test.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

new_subject() {
  local name="$1" root="$scratch/$1"
  mkdir -p "$root/frontend/src" "$root/frontend/public" "$root/cmd/server"
  : >"$root/Dockerfile"; : >"$root/docker-compose.yml"; : >"$root/go.mod"; : >"$root/frontend/package.json"
  printf 'package main\n' >"$root/cmd/server/main.go"
  printf 'export const copy = "no ads";\n' >"$root/frontend/src/main.ts"
  printf '%s\n' "$root"
}

valid="$(new_subject valid)"
CRACKLEDATE_PRODUCT_ROOT="$valid" "$verifier" >/dev/null || exit 1

injections=(
  '/api/submissions'
  'SUBMISSIONS_PATH'
  'modernc.org/sqlite'
  '/badges/'
  'achievement'
  'googleads'
  'billingclient'
  'buy access'
)
index=0
for injection in "${injections[@]}"; do
  root="$(new_subject "injection-$index")"
  printf '%s\n' "$injection" >>"$root/frontend/src/main.ts"
  if CRACKLEDATE_PRODUCT_ROOT="$root" "$verifier" >/dev/null 2>&1; then
    printf 'product injection accepted: %s\n' "$injection" >&2
    exit 1
  fi
  index=$((index + 1))
done

root="$(new_subject badges-directory)"
mkdir -p "$root/frontend/public/badges"
if CRACKLEDATE_PRODUCT_ROOT="$root" "$verifier" >/dev/null 2>&1; then exit 1; fi

printf 'product contract self-tests passed\n'
