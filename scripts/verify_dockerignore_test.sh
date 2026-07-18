#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-dockerignore-test.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

new_subject() {
  local name="$1"
  local subject="$scratch/$name"
  mkdir -p "$subject/scripts"
  cp "$repo_dir/.dockerignore" "$subject/.dockerignore"
  cp "$repo_dir/.gitignore" "$subject/.gitignore"
  cp "$repo_dir/scripts/verify_dockerignore.sh" "$subject/scripts/verify_dockerignore.sh"
  chmod +x "$subject/scripts/verify_dockerignore.sh"
  printf '%s\n' "$subject"
}

expect_pass() {
  local subject="$1"
  if ! "$subject/scripts/verify_dockerignore.sh" >/dev/null 2>&1; then
    printf 'expected verifier success for %s\n' "$subject" >&2
    exit 1
  fi
}

expect_fail() {
  local subject="$1"
  if "$subject/scripts/verify_dockerignore.sh" >/dev/null 2>&1; then
    printf 'expected verifier failure for %s\n' "$subject" >&2
    exit 1
  fi
}

subject="$(new_subject valid)"
expect_pass "$subject"

required_rules=(
  '**'
  '!Dockerfile'
  '!go.mod'
  '!go.sum'
  '!cmd'
  'cmd/**'
  '!cmd/server'
  'cmd/server/**'
  '!cmd/server/*.go'
  '!cmd/submissions-audit'
  'cmd/submissions-audit/**'
  '!cmd/submissions-audit/*.go'
  '!cmd/submissions-reconcile'
  'cmd/submissions-reconcile/**'
  '!cmd/submissions-reconcile/*.go'
  '!internal'
  'internal/**'
  '!internal/game'
  'internal/game/**'
  '!internal/game/*.go'
  '!internal/game/testdata'
  'internal/game/testdata/**'
  '!internal/game/testdata/hint-parity-v1.json'
  '!internal/game/testdata/hint-parity-v1.sha256'
  '!internal/game/testdata/validation-parity-v1.json'
  '!internal/submissionevidence'
  'internal/submissionevidence/**'
  '!internal/submissionevidence/*.go'
  '!internal/submissionfixture'
  'internal/submissionfixture/**'
  '!internal/submissionfixture/*.go'
  '!frontend'
  'frontend/**'
  '!frontend/package.json'
  '!frontend/package-lock.json'
  '!frontend/index.html'
  '!frontend/tsconfig.json'
  '!frontend/tsconfig.node.json'
  '!frontend/vite.config.ts'
  '!frontend/src'
  'frontend/src/**'
  '!frontend/src/*.ts'
  '!frontend/src/*.tsx'
  '!frontend/src/*.css'
  '!frontend/public'
  'frontend/public/**'
  '!frontend/public/*.png'
  '!frontend/public/badges'
  'frontend/public/badges/**'
  '!frontend/public/badges/*.png'
  '!frontend/public/how-to-play'
  'frontend/public/how-to-play/**'
  '!frontend/public/how-to-play/*.png'
)

index=0
for rule in "${required_rules[@]}"; do
  subject="$(new_subject "required-$index")"
  awk -v remove="$rule" '$0 != remove { print }' "$subject/.dockerignore" >"$subject/.dockerignore.next"
  mv "$subject/.dockerignore.next" "$subject/.dockerignore"
  expect_fail "$subject"
  index=$((index + 1))
done

protected_rules=(
  'data/'
  '**/data/'
  '*.db'
  '**/*.db'
  '*.db-*'
  '**/*.db-*'
  '*.db.*'
  '**/*.db.*'
  '*.sqlite'
  '**/*.sqlite'
  '*.sqlite-*'
  '**/*.sqlite-*'
  '*.sqlite.*'
  '**/*.sqlite.*'
  '*.sqlite3'
  '**/*.sqlite3'
  '*.sqlite3-*'
  '**/*.sqlite3-*'
  '*.sqlite3.*'
  '**/*.sqlite3.*'
  '*-wal'
  '**/*-wal'
  '*-shm'
  '**/*-shm'
  '*-journal'
  '**/*-journal'
  '*.backup'
  '**/*.backup'
  '*.bak'
  '**/*.bak'
  '*.log'
  '**/*.log'
  'log/'
  '**/log/'
  'logs/'
  '**/logs/'
  '*.ndjson'
  '**/*.ndjson'
  '*.jsonl'
  '**/*.jsonl'
  '.env'
  '**/.env'
  '.env.*'
  '**/.env.*'
  'node_modules/'
  '**/node_modules/'
  'dist/'
  '**/dist/'
  'build/'
  '**/build/'
  'coverage/'
  '**/coverage/'
  '.vite/'
  '**/.vite/'
  'playwright-report/'
  '**/playwright-report/'
  'test-results/'
  '**/test-results/'
  '.git/'
  '**/.git/'
  '.DS_Store'
  '**/.DS_Store'
  '.superpowers/'
  '**/.superpowers/'
  'tmp/'
  '**/tmp/'
  'temp/'
  '**/temp/'
  'backup/'
  '**/backup/'
  'backups/'
  '**/backups/'
  'cmd/server/public/**'
)

index=0
for rule in "${protected_rules[@]}"; do
  subject="$(new_subject "protected-$index")"
  awk -v remove="$rule" '$0 != remove { print }' "$subject/.dockerignore" >"$subject/.dockerignore.next"
  mv "$subject/.dockerignore.next" "$subject/.dockerignore"
  expect_fail "$subject"
  index=$((index + 1))
done

for malicious in \
  '!data/submissions.db' \
  '!nested/data/submissions.db' \
  '!nested/private.sqlite-wal' \
  '!nested/.env.production' \
  '!cmd/**' \
  '!internal/**' \
  '!frontend/src/**' \
  '!frontend/public/**' \
  '!cmd/server/submissions.json' \
  '!cmd/server/submissions.txt' \
  '!cmd/server/logs/submissions.ndjson' \
  '!cmd/server/logs/submissions.json' \
  '!internal/nested/trace.jsonl' \
  '!frontend/src/submissions.json' \
  '!frontend/src/submissions.txt' \
  '!frontend/public/logs/submissions.ndjson' \
  '!frontend/public/logs/submissions.json' \
  '!frontend/public/submissions.txt' \
  '!frontend/src/logs/submissions.txt' \
  '!cmd/server/public/stale.js'; do
  subject="$(new_subject malicious)"
  printf '%s\n' "$malicious" >>"$subject/.dockerignore"
  expect_fail "$subject"
done

for rule in '.env' '.env.*' '**/.env' '**/.env.*'; do
  subject="$(new_subject gitignore-remove)"
  awk -v remove="$rule" '$0 != remove { print }' "$subject/.gitignore" >"$subject/.gitignore.next"
  mv "$subject/.gitignore.next" "$subject/.gitignore"
  expect_fail "$subject"
done

for malicious in '!.env' '!.env.production' '!nested/.env' '!**/.env.*'; do
  subject="$(new_subject gitignore-negation)"
  printf '%s\n' "$malicious" >>"$subject/.gitignore"
  expect_fail "$subject"
done

printf 'verify_dockerignore self-tests passed\n'
