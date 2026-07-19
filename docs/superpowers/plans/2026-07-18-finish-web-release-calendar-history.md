# Finish Web Release and Calendar History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Crackle Date web as a stateless service, remove the standalone Stats/Saved Solutions page, and show the selected day's average solve time beside its locally saved Calendar equations.

**Architecture:** React keeps all durable gameplay state in verified browser storage and derives the selected-day average directly from saved solutions. Go exposes only request-scoped puzzle/evaluation/validation/hint APIs, emits a six-field identifier-free request log, and ships as one server binary with no SQLite, submission route, storage environment, or mount. Production deploys an immutable revision without the legacy volume, proves that volume is detached with metadata-only checks, and never opens or deletes it.

**Tech Stack:** Go 1.25, `net/http`, React 19, TypeScript 5.9, Vitest 4, Vite 7, Playwright Chromium, Docker, Docker Compose, Bash policy tests.

## Global Constraints

- No ads, purchases, accounts, tracking, public profiles, achievement badges, or cloud gameplay history.
- Saved equations, solve times, streak calculations, settings, theme, difficulty, and onboarding remain in browser storage only.
- Practice never saves or changes Calendar history, averages, or streaks.
- Average Time uses only selected-day solutions with `seconds > 0`, rounds to the nearest whole second, and renders `—` when none qualify.
- Keep Archive, Used Hint, Easy, and Hard as ordinary tags.
- The service processes current puzzle/equation/validation/hint inputs only for the response and retains no gameplay content.
- Request logs contain exactly `timestamp`, `level`, `method`, `path`, `status`, and `durationMs`.
- The shipping image has no SQLite driver, submission tool, storage environment, `/data` mount, or submissions volume.
- Unknown `/api/` paths return bounded JSON 404 responses rather than the React shell.
- Legacy session-cookie expiry remains for this release.
- Production volume deletion, opening, copying, exporting, and content inspection are outside this plan.
- Work on `development`, use red-green-refactor, commit each independently green task, then push `development` and fast-forward `main` after the complete gate passes.

---

### Task 1: Replace the Stats Page with Calendar Daily Average

**Files:**
- Create: `frontend/src/calendarHistory.ts`
- Create: `frontend/src/calendarHistory.test.ts`
- Modify: `frontend/src/main.tsx`, `frontend/src/styles.css`
- Modify: `frontend/src/productContract.test.ts`, `frontend/src/hintRequestCoordinator.test.ts`

**Interfaces:**
- Produces: `averageTimeForSolutions(solutions: readonly { seconds: number }[]): number | null`
- Consumes: existing `formatTime`, `SolutionsList`, `StoredSolutions`, selected date, and verified saved-solution state.

- [ ] **Step 1: Write the failing pure tests**

```ts
import { describe, expect, test } from 'vitest';
import { averageTimeForSolutions } from './calendarHistory';

describe('averageTimeForSolutions', () => {
  test('averages only positive durations and rounds', () => {
    expect(averageTimeForSolutions([{ seconds: 10 }, { seconds: 0 }, { seconds: -4 }, { seconds: 15 }])).toBe(13);
  });
  test('returns null without a timed solution', () => {
    expect(averageTimeForSolutions([])).toBeNull();
    expect(averageTimeForSolutions([{ seconds: 0 }])).toBeNull();
  });
});
```

- [ ] **Step 2: Add failing surface assertions**

Extend `productContract.test.ts`:

```ts
for (const removed of ["| 'solutions'", 'label="Stats"', 'function SolutionsPage(', 'function StatsIcon(', 'solutions-summary-section']) {
  expect(productSurface).not.toContain(removed);
}
expect(productSurface).toContain('Average Time');
expect(productSurface).toContain("averageSeconds === null ? '—' : formatTime(averageSeconds)");
```

Remove the Stats row from the navigation cancellation matrix in `hintRequestCoordinator.test.ts`.

- [ ] **Step 3: Run RED**

```bash
cd frontend
npm test -- src/calendarHistory.test.ts src/productContract.test.ts src/hintRequestCoordinator.test.ts
```

Expected: missing-module compile failure and existing Stats surface failures.

- [ ] **Step 4: Implement the helper**

```ts
export function averageTimeForSolutions(solutions: readonly { seconds: number }[]): number | null {
  const durations = solutions.map(({ seconds }) => seconds).filter((seconds) => seconds > 0);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((total, seconds) => total + seconds, 0) / durations.length);
}
```

- [ ] **Step 5: Consolidate history into Calendar**

Remove `'solutions'` from `ActiveView`; remove `showSolutions`, the Stats toolbar button, `solutions-shell`, `SolutionsPage`, `SummaryStat`, `savedSolutionsSummary`, and `StatsIcon`; route the daily-dashboard Saved Solutions action to `showCalendar`. In `CalendarPage` add:

```tsx
const selectedSolutions = savedSolutions[selectedDate] ?? [];
const averageSeconds = useMemo(() => averageTimeForSolutions(selectedSolutions), [selectedSolutions]);
```

Render immediately above the existing list:

```tsx
<article className="calendar-average-card" aria-label="Average time for selected date">
  <span>Average Time</span>
  <strong>{averageSeconds === null ? '—' : formatTime(averageSeconds)}</strong>
</article>
<SolutionsList solutions={selectedSolutions} onShare={(solution) => onShare(solution, selectedDate)} />
```

Delete page-only summary/activity styles and add responsive `.calendar-average-card` styles using current glass variables.

- [ ] **Step 6: Run GREEN and commit**

```bash
cd frontend
npm test -- src/calendarHistory.test.ts src/productContract.test.ts src/hintRequestCoordinator.test.ts src/dailyDashboard.test.ts
npm run build
cd ..
git diff --check
git add frontend/src
git commit -m "feat(web): move local history into calendar"
```

---

### Task 2: Remove Server Persistence and SQLite

**Files:**
- Create: `cmd/server/application.go`, `cmd/server/application_test.go`
- Modify: `cmd/server/main.go`, `cmd/server/runtime_config.go`, `cmd/server/security_test.go`
- Delete: `cmd/server/submissions.go`, `cmd/server/submissions_test.go`
- Delete: `cmd/server/legacy_retirement.go`, `cmd/server/legacy_retirement_test.go`
- Delete: `cmd/submissions-audit/`, `cmd/submissions-reconcile/`
- Delete: `internal/submissionevidence/`, `internal/submissionfixture/`
- Modify: `go.mod`, `go.sum`

**Interfaces:**
- Produces: `initializeRuntime(getenv func(string) string) (runtimeSecurityConfig, error)`
- Produces: `newApplicationHandler(config runtimeSecurityConfig, publicFiles fs.FS) http.Handler`

- [ ] **Step 1: Write failing absence tests**

For GET, POST, PUT, PATCH, and DELETE `/api/submissions`, require status 404, JSON content type, no-store, body exactly `{"error":"Not found"}\n`, and no reflected sentinel body. Record getenv keys and fail if initialization reads `SUBMISSIONS_PATH`, `RETIRE_LEGACY_ACCOUNT_DATA`, or `CLIENT_HASH_SECRET`.

- [ ] **Step 2: Run RED**

```bash
go test ./cmd/server -run 'TestApplicationHasNoSubmissionEndpoint|TestRuntimeInitializationReadsNoStorageConfiguration' -count=1
```

- [ ] **Step 3: Extract application assembly**

Register health, puzzle, evaluate, validate, and hint, then method-independent `/api/` JSON 404, then static `/`. Wrap rate limiting, the strict logger, security headers, and legacy-cookie expiry. Keep `main` limited to config, embedded FS, HTTP server, and `ListenAndServe`.

- [ ] **Step 4: Simplify config and delete persistence**

Keep only resolver and max hint concurrency in `runtimeSecurityConfig`; remove store opening and persistence branches; delete the listed files; run `go mod tidy`.

- [ ] **Step 5: Run GREEN and commit**

```bash
go test ./... -count=1
go test -race ./cmd/server ./internal/game -count=1
if go list -deps ./cmd/server | rg -q 'modernc.org/sqlite|database/sql'; then exit 1; fi
git diff --check
git add -A cmd internal go.mod go.sum
git commit -m "feat(server): remove gameplay submission persistence"
```

---

### Task 3: Emit Only Minimal Request Logs

**Files:**
- Create: `cmd/server/request_log.go`
- Modify: `cmd/server/main.go`, `cmd/server/client_address.go`, `cmd/server/rate_limit.go`
- Modify: `cmd/server/analytics_test.go`, `cmd/server/security_test.go`

**Interfaces:**
- Produces: `type requestLogConfig struct { now func() time.Time; output io.Writer }`
- Produces: `requestLogger(next http.Handler, config requestLogConfig) http.Handler`

- [ ] **Step 1: Write the failing exact-schema test**

Send a request with sentinel query, body, address, Cloudflare, user-agent, and referrer values. Decode one log object; sorted keys must equal:

```go
[]string{"durationMs", "level", "method", "path", "status", "timestamp"}
```

Require normalized `/api/hint`, no query, nonnegative duration, and no sentinel in raw output.

- [ ] **Step 2: Run RED**

```bash
go test ./cmd/server -run TestRequestLoggerEmitsOnlyAllowedFields -count=1
```

- [ ] **Step 3: Implement a typed six-field logger**

```go
type requestLogEntry struct {
    Timestamp string `json:"timestamp"`
    Level string `json:"level"`
    Method string `json:"method"`
    Path string `json:"path"`
    Status int `json:"status"`
    DurationMS int64 `json:"durationMs"`
}
```

Use one injected clock before/after the handler, clamp negative duration to zero, clean `URL.Path` only, and never resolve clients while logging. Narrow the resolver to the address string used only by bounded in-memory rate limiting.

- [ ] **Step 4: Run GREEN and commit**

```bash
go test ./cmd/server -run 'TestRequestLogger|TestClientAddress|TestRateLimit' -count=1
go test -race ./cmd/server -count=1
git diff --check
git add cmd/server
git commit -m "fix(server): remove client identifiers from request logs"
```

---

### Task 4: Package and Prove a Stateless Image

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- Modify: `scripts/verify_compose.sh`, `scripts/verify_compose_test.sh`
- Modify: `scripts/verify_dockerignore.sh`, `scripts/verify_dockerignore_test.sh`
- Create: `scripts/verify_stateless_deployment_identity.sh`, `scripts/verify_stateless_deployment_identity_test.sh`
- Keep unchanged: legacy deployment and volume-capture guards.

- [ ] **Step 1: Rewrite Compose tests first**

Require one loopback service and add independent failure mutations for storage/client-hash/retirement env, `/data`, named/bind/top-level volumes, `env_file`, `container_name`, and a second service.

- [ ] **Step 2: Run RED**

```bash
scripts/verify_compose_test.sh
```

- [ ] **Step 3: Simplify packaging**

Build/copy only `crackledate-web`; remove `/data`, audit/reconcile binaries, storage env, and all mounts. Keep only trusted proxy CIDRs and max hint concurrency in Compose. Keep only active source plus the exact parity fixtures in the Docker context.

- [ ] **Step 4: Add the stateless identity guard and fake-Docker matrix**

Require exact context/host/config, Compose labels, container/image/revision, restart/state, zero mounts, absence of all three forbidden env prefixes, `/app/crackledate-web` present, and submission/audit/reconcile/database artifacts absent. Print only `stateless deployment identity verified`. Mutate every field and model Docker's extra formatted-output newline.

- [ ] **Step 5: Run GREEN, build, and commit**

```bash
scripts/verify_compose_test.sh
scripts/verify_compose.sh
scripts/verify_dockerignore_test.sh
scripts/verify_dockerignore.sh
scripts/verify_deployment_identity_test.sh
scripts/verify_stateless_deployment_identity_test.sh
scripts/capture_submissions_volume_identity_test.sh
git diff --check
git add Dockerfile docker-compose.yml .dockerignore scripts
git commit -m "build(web): package a stateless server image"
```

---

### Task 5: Align Copy, Docs, and Product Guards

**Files:**
- Modify: Privacy/Support in `frontend/src/main.tsx` and related tests
- Modify: `frontend/src/howToPlayContent.ts`, `rulesContent.ts`, `SettingsPanel.tsx` and tests
- Create: `scripts/verify_product_contract.sh`, `scripts/verify_product_contract_test.sh`
- Modify: `README.md`, `AGENTS.md`, historical plan banners

- [ ] **Step 1: Write failing copy tests**

Require the four canonical Privacy sentences from the design spec, the exact missing-history Support paragraph, instruction title `Review Calendar History`, and note `Use Calendar to review saved equations, solve times, and each day's average kept in this browser.` Reject `Check Stats`, Saved Solutions screen, badge/achievement, submission, and network-hash claims.

- [ ] **Step 2: Run RED**

```bash
cd frontend
npm test -- src/privacyDisclosure.test.ts src/howToPlayContent.test.ts src/rulesContent.test.ts src/SettingsPanel.test.tsx src/productContract.test.ts
```

- [ ] **Step 3: Implement copy/docs and shipping guard**

Align active copy and docs to Calendar/local-only/stateless behavior. Build a guard that rejects active `/api/submissions`, storage/client-hash/SQLite, achievement assets/models, ad SDKs, billing/store/checkout, and monetized access phrases while allowing truthful `no ads`; self-test a clean case and one injection per category.

- [ ] **Step 4: Run GREEN and commit**

```bash
cd frontend
npm test -- src/privacyDisclosure.test.ts src/howToPlayContent.test.ts src/rulesContent.test.ts src/SettingsPanel.test.tsx src/productContract.test.ts
cd ..
scripts/verify_product_contract_test.sh
scripts/verify_product_contract.sh
git diff --check
git add frontend/src README.md AGENTS.md scripts docs/superpowers/plans
git commit -m "docs(web): align calendar privacy and shipping policy"
```

---

### Task 6: Browser Flows and Active Screenshots

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/playwright.config.ts`, `frontend/e2e/player-flow.spec.ts`, `frontend/e2e/privacy-support.spec.ts`
- Update: instruction screenshots and `docs/screenshots/settings-panel.jpg`

- [ ] **Step 1: Add Playwright config**

Add Chromium `test:e2e` and `screenshots:update`, base URL `http://127.0.0.1:5173`, root `npm run dev` web server, line reporter, and trace-on-failure.

- [ ] **Step 2: Write RED browser flows**

Cover guided Practice isolation; Calendar with no Stats control; no-history em dash; one timed solution; two timed plus one zero-time rounded average; date recomputation; share and Play this Date; POST hint stages; Clear Data; canonical Privacy/Support and forbidden-copy absence.

- [ ] **Step 3: Run RED, update screenshots, then GREEN**

```bash
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
CRACKLEDATE_UPDATE_SCREENSHOTS=1 npm run screenshots:update
npm run test:e2e
npm test
npm run build
cd ..
git diff --check
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e frontend/public/how-to-play docs/screenshots/settings-panel.jpg
git commit -m "test(web): cover calendar-first local flows"
```

- [ ] **Step 4: Run interactive Browser-plugin QA**

Use the available Browser plugin against the exact local URL. Verify page identity, meaningful DOM, no framework overlay, clean warning/error console, desktop and mobile Calendar screenshots, no-history and multiple-solution average states, date selection, Share, Play this Date, Settings, Privacy, Support, and absence of Stats navigation.

---

### Task 7: Full Gate, Push, Deploy, and Detachment Proof

**Production identity:** `admin@192.168.86.222`; Docker `default` / `unix:///var/run/docker.sock` / `/home/admin/.docker`; project and service `crackledate-site`; directory `/opt/crackledate-site`; legacy volume `crackledate-site_submissions`.

- [ ] **Step 1: Run the fresh full gate**

```bash
git status --short
go test ./... -count=1
go test -race ./cmd/server ./internal/game -count=1
go run ./cmd/hint-fixtures --check
cd frontend && npm ci && npm test && npm run build && npm run test:e2e && cd ..
scripts/verify_product_contract_test.sh && scripts/verify_product_contract.sh
scripts/verify_compose_test.sh && scripts/verify_compose.sh
scripts/verify_dockerignore_test.sh && scripts/verify_dockerignore.sh
scripts/verify_deployment_identity_test.sh
scripts/verify_stateless_deployment_identity_test.sh
scripts/capture_submissions_volume_identity_test.sh
git diff --check
git status --short
```

- [ ] **Step 2: Push exact revision**

```bash
git push origin development
git push origin development:main
git fetch origin development main
test "$(git rev-parse origin/development)" = "$(git rev-parse HEAD)"
test "$(git rev-parse origin/main)" = "$(git rev-parse HEAD)"
```

- [ ] **Step 3: Build and smoke the immutable image without touching the live service**

On the approved server, fast-forward clean `main` to the exact pushed revision and build `crackledate-web:$(git rev-parse --short HEAD)` with the full revision label. Start one transient `crackledate-release-smoke` container with restart `no`, no mounts, and loopback port `127.0.0.1:18082:8080`. Require health 200; every submissions method JSON 404; successful no-store POST hint; Privacy/Support 200; forbidden environment absent; zero mounts. Stop and remove only that named smoke container after verification.

- [ ] **Step 4: Capture current stateful identity twice**

On production require clean `main`, pull the exact revision, resolve the current full container, and prove its project/service labels and `volume|crackledate-site_submissions|/data`. Capture a new mode-0600 primary fingerprint and `.confirm` fingerprint with that same container ID, compare byte-for-byte, and remove only `.confirm`. Never read gameplay contents or remove earlier evidence.

- [ ] **Step 5: Deploy the already verified immutable stateless image**

Recreate only the service with `/dev/null` env, exact project, exact previously built image, `unless-stopped`, no submissions-volume variable, and never `down -v`.

- [ ] **Step 6: Runtime and public proof**

Run the stateless identity guard. Require exact labels/revision, zero mounts, forbidden env absent, restart count zero, local/public health 200, submissions JSON 404, POST hint 200 no-store, GET hint 405 no-store, canonical Privacy/Support, Calendar average/history interaction, and no Stats navigation.

- [ ] **Step 7: Log and proxy gate**

Generate one sentinel request and require the application log object has only the six allowed keys and no sentinel. Read the active `cloudflared` service/config and prove retained access logs are disabled or omit query, body, network identifier/hash, user agent, referrer, country, and Ray. If this cannot be proven, report the release blocked rather than claiming completion.

- [ ] **Step 8: Prove volume detachment and stop**

Run metadata-only detached-volume verification with the new primary fingerprint. Require unchanged volume metadata and zero consumers. Do not mount, open, copy, export, delete, or inspect gameplay files.

## Self-Review Results

- Every design requirement maps to Tasks 1–7.
- `averageTimeForSolutions` consistently returns `number | null`; Calendar maps null to `—`.
- `solutions` disappears from active navigation; history actions target Calendar.
- `/api/submissions` exists only as a JSON 404 through `/api/` fallback.
- Logger fields, Compose environment, identity guard, and deployment expectations use identical names.
- Dynamic revisions and container IDs are resolved by exact commands; every implementation value is defined at execution time.
- No step authorizes volume content access or deletion.
