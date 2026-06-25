# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project Shape

- This repo contains the deployable web version of Crackle Date.
- The frontend is React + Vite in `frontend/`.
- The backend is Go in `cmd/server/` and `internal/`.
- The Vite dev server proxies `/api` requests to the Go backend on `http://localhost:8080`.
- Product monetization rules are shared with Android and iOS: `$1.99` supporter option removes date-based ads, while non-supporters can see a past-date banner, current-date banner after one saved solution, and 30-second future-date sponsor unlock.
- Guided First Crack is shared with Android and iOS: first-time web play should route through the guided entry, start the Practice Round guided tutorial, and mark completion only after the full guided practice solve succeeds.
- Practice is shared with Android and iOS: use the June 19, 2026 sample round, highlight each next tutorial step, and never save, sync, or submit practice attempts.
- Rules is a written Settings destination shared with Android and iOS; keep it separate from visual Cracked Instructions.
- Share payloads are shared with Android and iOS: daily shares are spoiler-free, while saved-solution shares include the equation, value, and solve time.
- Daily Dashboard work should match Android's selected-date summary: cracked moment, streak/month cards, next badge target, spoiler-free daily share, keep-playing, saved-solutions, and calendar actions.

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

## Checks

- Backend tests: `go test ./...`
- Frontend tests: `cd frontend && npm test`
- Frontend build/type check: `cd frontend && npm run build`

## Environment

- `PORT` controls the backend port and defaults to `8080`.
- `SUBMISSIONS_PATH` controls where submitted solutions are stored.
- `CLIENT_HASH_SECRET` salts rotating request-log client hashes; set it for production-like deployments.

## Notes For Agents

- Keep the Go backend and Vite frontend as separate local dev processes.
- Do not commit `frontend/node_modules/`, `frontend/dist/`, `data/`, or local log files.
- Prefer small, focused changes and run the relevant checks before committing.
- Keep privacy/support copy aligned when changing account, ad, paid-support, or submission behavior.
