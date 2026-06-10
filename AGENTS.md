# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project Shape

- This repo contains the deployable web version of Crackle Date, the shared TypeScript game core,
  and the Expo Native Android app.
- The frontend is React + Vite in `frontend/`.
- The backend is Go in `cmd/server/` and `internal/`.
- Shared offline game/domain code lives in `packages/crackledate-core/`.
- The Android app lives in `apps/android/` and uses Expo Router plus local SQLite persistence.
- The Vite dev server proxies `/api` requests to the Go backend on `http://localhost:8080`.

## Local Development

Use the root dev runner for hot-reload local work:

```bash
npm run dev
```

This starts the Go backend and Vite frontend as separate processes. Open
`http://localhost:5173/` for the local app. Vite hot reloads frontend changes,
and the runner restarts the Go backend when backend files change. The runner
uses `CRACKLEDATE_API_PORT` when set, otherwise API port `5174`.

Manual process startup still works.

Install JavaScript workspace dependencies from the repo root:

```bash
npm install
```

Run the backend from the repo root:

```bash
go run ./cmd/server
```

Run the frontend from `frontend/`:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/` for the local app.

Run the Android app from the repo root:

```bash
npm --workspace @crackledate/android start
```

The Android app is offline-first: correct solves are saved locally first, then anonymous submission
records are queued and retried against `https://crackledate.com/api/submissions`.

## Checks

- Backend tests: `go test ./...`
- Frontend tests: `cd frontend && npm test`
- Frontend build/type check: `cd frontend && npm run build`
- Shared core tests: `npm --workspace @crackledate/core test`
- Shared core build/type check: `npm --workspace @crackledate/core run build`
- Android tests: `npm --workspace @crackledate/android test`
- Android build/type check: `npm --workspace @crackledate/android run build`
- Android Expo Doctor: `npm --workspace @crackledate/android run doctor`

## Environment

- `PORT` controls the backend port and defaults to `8080`.
- `SUBMISSIONS_PATH` controls where submitted solutions are stored.
- `CLIENT_HASH_SECRET` salts rotating request-log client hashes; set it for production-like deployments.

## Advertising And Privacy

- The site may add ads for archive play, especially puzzle dates older than a week.
- Use `/date/YYYY-MM-DD` as the canonical URL surface for archive-specific ad targeting.
- Do not add or preserve copy that says Crackle Date is always ad-free.
- Read `docs/ads.md` before integrating ad scripts, consent messaging, publisher IDs, or `ads.txt`.
- Keep ad integration separate from anonymous solution submissions; do not attach ad identifiers to submitted solution records.
- Android v1 should not add ads, accounts, login, in-app purchases, or tracking without a reviewed
  product/privacy update.
- Use official test flows for ad verification and do not click live ads during testing.

## Notes For Agents

- Keep the Go backend and Vite frontend as separate local dev processes.
- Do not commit `node_modules/`, `frontend/node_modules/`, `frontend/dist/`, `apps/android/.expo/`,
  generated native `apps/android/android/` or `apps/android/ios/`, `data/`, or local log files.
- Keep `packages/crackledate-core/` portable: no DOM, Expo, React Native, or Go-only assumptions.
- Preserve `/api/submissions` as the anonymous cross-platform upload surface. Accepted platforms are
  `web`, `ios`, and `android`.
- Prefer small, focused changes and run the relevant checks before committing.
