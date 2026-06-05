# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project Shape

- This repo contains the deployable web version of Crackle Date.
- The frontend is React + Vite in `frontend/`.
- The backend is Go in `cmd/server/` and `internal/`.
- The Vite dev server proxies `/api` requests to the Go backend on `http://localhost:8080`.

## Local Development

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
