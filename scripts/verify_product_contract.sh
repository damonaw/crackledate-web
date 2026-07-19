#!/usr/bin/env bash
set -euo pipefail

root="${CRACKLEDATE_PRODUCT_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)}"
fail() { printf 'product contract verification failed\n' >&2; exit 1; }

required=(Dockerfile docker-compose.yml go.mod frontend/src frontend/public cmd/server)
for path in "${required[@]}"; do [[ -e "$root/$path" ]] || fail; done

if [[ -d "$root/frontend/public/badges" || -d "$root/cmd/submissions-audit" || -d "$root/cmd/submissions-reconcile" ]]; then fail; fi

scan="$root/.product-contract-files"
trap 'rm -f "$scan"' EXIT
find "$root/cmd/server" -maxdepth 1 -type f -name '*.go' ! -name '*_test.go' -print >"$scan"
find "$root/frontend/src" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) ! -name '*.test.ts' ! -name '*.test.tsx' -print >>"$scan"
printf '%s\n' "$root/Dockerfile" "$root/docker-compose.yml" "$root/go.mod" "$root/frontend/package.json" >>"$scan"

if xargs grep -Eni '/api/submissions|SUBMISSIONS_PATH|CLIENT_HASH_SECRET|RETIRE_LEGACY_ACCOUNT_DATA|modernc\.org/sqlite|database/sql|/badges/|achievement|admob|googleads|doubleclick|stripe|revenuecat|billingclient|checkout|buy access|paid date|premium date' <"$scan" >/dev/null; then
  fail
fi

printf 'product contract verified\n'
