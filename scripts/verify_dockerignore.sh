#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-dockerignore.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

expected_dockerignore=(
  '**'
  '!Dockerfile'
  '!go.mod'
  '!go.sum'
  '!cmd'
  'cmd/**'
  '!cmd/server'
  'cmd/server/**'
  '!cmd/server/*.go'
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
  '!frontend/public/how-to-play'
  'frontend/public/how-to-play/**'
  '!frontend/public/how-to-play/*.png'
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
  '.DS_Store'
  '**/.DS_Store'
  '.git/'
  '**/.git/'
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

actual_dockerignore=()
while IFS= read -r line || [[ -n "$line" ]]; do
  actual_dockerignore+=("$line")
done <"$repo_dir/.dockerignore"

if [[ ${#actual_dockerignore[@]} -ne ${#expected_dockerignore[@]} ]]; then
  printf '.dockerignore is not the reviewed exact allowlist\n' >&2
  exit 1
fi
for ((index = 0; index < ${#expected_dockerignore[@]}; index++)); do
  if [[ "${actual_dockerignore[$index]}" != "${expected_dockerignore[$index]}" ]]; then
    printf '.dockerignore is not the reviewed exact allowlist\n' >&2
    exit 1
  fi
done

required_gitignore=(
  '.env'
  '.env.*'
  '**/.env'
  '**/.env.*'
)
for required in "${required_gitignore[@]}"; do
  matches=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$required" ]]; then
      matches=$((matches + 1))
    fi
  done <"$repo_dir/.gitignore"
  if [[ $matches -ne 1 ]]; then
    printf '.gitignore is missing an exact environment-file protection\n' >&2
    exit 1
  fi
done

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == '!.env.example' || "$line" == '!**/.env.example' ]]; then
    continue
  fi
  if [[ "$line" == '!'* ]]; then
    printf '.gitignore contains an unreviewed negation\n' >&2
    exit 1
  fi
done <"$repo_dir/.gitignore"

required_directories=(
  'cmd'
  'cmd/server'
  'internal'
  'internal/game'
  'internal/game/testdata'
  'frontend'
  'frontend/src'
  'frontend/public'
  'frontend/public/how-to-play'
)
required_paths=(
  'Dockerfile'
  'go.mod'
  'go.sum'
  'cmd/server/main.go'
  'internal/game/date.go'
  'internal/game/testdata/hint-parity-v1.json'
  'internal/game/testdata/hint-parity-v1.sha256'
  'internal/game/testdata/validation-parity-v1.json'
  'frontend/package.json'
  'frontend/package-lock.json'
  'frontend/index.html'
  'frontend/tsconfig.json'
  'frontend/tsconfig.node.json'
  'frontend/vite.config.ts'
  'frontend/src/dateAccessPolicy.ts'
  'frontend/src/main.tsx'
  'frontend/src/styles.css'
  'frontend/public/app-icon.png'
  'frontend/public/how-to-play/instruction-1.png'
)
protected_paths=(
  'data/submissions.db'
  'nested/data/submissions.db-wal'
  'cmd/server/private.sqlite3-shm'
  'internal/private.db.backup'
  'cmd/server/nested/helper.go'
  'cmd/server/submissions.json'
  'cmd/server/submissions.txt'
  'cmd/server/logs/submissions.ndjson'
  'cmd/server/logs/submissions.json'
  'cmd/server/logs/submissions.txt'
  'cmd/submissions-audit/nested/helper.go'
  'internal/game/nested/helper.go'
  'internal/game/submissions.json'
  'internal/game/submissions.txt'
  'internal/game/testdata/submissions.json'
  'internal/game/testdata/extra.json'
  'internal/game/log/trace.ndjson'
  'internal/submissionfixture/nested/trace.jsonl'
  '.env'
  'frontend/.env.production'
  'frontend/node_modules/module.js'
  'frontend/dist/index.html'
  'frontend/playwright-report/index.html'
  'frontend/src/.DS_Store'
  'frontend/src/nested/helper.ts'
  'frontend/src/submissions.json'
  'frontend/src/submissions.txt'
  'frontend/src/logs/submissions.ndjson'
  'frontend/src/logs/submissions.json'
  'frontend/src/logs/submissions.txt'
  'frontend/public/nested/image.png'
  'frontend/public/submissions.json'
  'frontend/public/submissions.txt'
  'frontend/public/logs/submissions.ndjson'
  'frontend/public/logs/submissions.json'
  'frontend/public/logs/submissions.txt'
  'frontend/public/badges/notes.txt'
  'frontend/public/how-to-play/trace.jsonl'
  '.git/config'
  '.superpowers/sdd/progress.md'
  'nested/tmp/fixture.db'
  'backups/submissions.sqlite3'
  'server.log'
  'cmd/server/public/stale-bundle.js'
)

policy_allows_directory() {
  local path="$1"
  case "$path" in
    cmd|cmd/server|internal|internal/game|internal/game/testdata|frontend|frontend/src|frontend/public|frontend/public/how-to-play)
      return 0
      ;;
  esac
  return 1
}

is_allowed_direct_child() {
  local path="$1"
  local directory="$2"
  shift 2
  local prefix="${directory}/"
  if [[ "$path" != "$prefix"* ]]; then
    return 1
  fi
  local basename="${path#"$prefix"}"
  if [[ -z "$basename" || "$basename" == */* ]]; then
    return 1
  fi
  local suffix
  for suffix in "$@"; do
    if [[ "$basename" == *"$suffix" ]]; then
      return 0
    fi
  done
  return 1
}

policy_allows() {
  local path="$1"
  case "$path" in
    data/*|*/data/*|*.db|*.db-*|*.db.*|*.sqlite|*.sqlite-*|*.sqlite.*|*.sqlite3|*.sqlite3-*|*.sqlite3.*|*-wal|*-shm|*-journal|*.backup|*.bak|*.log|log/*|*/log/*|logs/*|*/logs/*|*.ndjson|*.jsonl|.env|*/.env|.env.*|*/.env.*|node_modules/*|*/node_modules/*|dist/*|*/dist/*|build/*|*/build/*|coverage/*|*/coverage/*|.vite/*|*/.vite/*|playwright-report/*|*/playwright-report/*|test-results/*|*/test-results/*|.DS_Store|*/.DS_Store|.git/*|*/.git/*|.superpowers/*|*/.superpowers/*|tmp/*|*/tmp/*|temp/*|*/temp/*|backup/*|*/backup/*|backups/*|*/backups/*|cmd/server/public/*)
      return 1
      ;;
  esac
  case "$path" in
    Dockerfile|go.mod|go.sum|frontend/package.json|frontend/package-lock.json|frontend/index.html|frontend/tsconfig.json|frontend/tsconfig.node.json|frontend/vite.config.ts)
      return 0
      ;;
    internal/game/testdata/hint-parity-v1.json|internal/game/testdata/hint-parity-v1.sha256|internal/game/testdata/validation-parity-v1.json)
      return 0
      ;;
  esac
  local directory
  for directory in cmd/server internal/game; do
    if is_allowed_direct_child "$path" "$directory" '.go'; then
      return 0
    fi
  done
  if is_allowed_direct_child "$path" 'frontend/src' '.ts' '.tsx' '.css'; then
    return 0
  fi
  for directory in frontend/public frontend/public/how-to-play; do
    if is_allowed_direct_child "$path" "$directory" '.png'; then
      return 0
    fi
  done
  return 1
}

fixture_root="$scratch/context"
for directory in "${required_directories[@]}"; do
  mkdir -p "$fixture_root/$directory"
done
for path in "${required_paths[@]}" "${protected_paths[@]}"; do
  mkdir -p "$fixture_root/$(dirname -- "$path")"
  : >"$fixture_root/$path"
done
for directory in "${required_directories[@]}"; do
  if ! policy_allows_directory "$directory"; then
    printf 'required synthetic build directory is excluded\n' >&2
    exit 1
  fi
done
for path in "${required_paths[@]}"; do
  if ! policy_allows "$path"; then
    printf 'required synthetic build input is excluded\n' >&2
    exit 1
  fi
done
for path in "${protected_paths[@]}"; do
  if policy_allows "$path"; then
    printf 'protected synthetic path is included\n' >&2
    exit 1
  fi
done

printf 'dockerignore policy verified\n'
