# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project Shape

- This repo contains the deployable web version of Crackle Date.
- The frontend is React + Vite in `frontend/`.
- The backend is Go in `cmd/server/` and `internal/`.
- The Vite dev server proxies `/api` requests to the Go backend on `http://localhost:8080`.
- Product access rules are shared with Android and iOS: Crackle Date does not show ads or offer in-app purchases, and past, current, and future dates open without paid unlocks.
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
- Compose policy: `scripts/verify_compose_test.sh && scripts/verify_compose.sh`
- Deployment identity policy: `scripts/verify_deployment_identity_test.sh` (fake Docker only; never invoke the live identity guard as a repository check)

## Environment

- `PORT` controls the backend port and defaults to `8080`.
- `SUBMISSIONS_PATH` controls where submitted solutions are stored.
- `CLIENT_HASH_SECRET` salts rotating request-log client hashes; set it for production-like deployments.
- Proxy trust lists default empty, and `RETIRE_LEGACY_ACCOUNT_DATA` must default empty outside the single reviewed maintenance create.

For isolated local Compose work, choose a project name unique to the checkout and validate without rendering secrets:

```bash
DEV_PROJECT=crackledate-web-agent-your-unique-checkout-id
docker compose --env-file /dev/null -f "$PWD/docker-compose.yml" --project-directory "$PWD" --project-name "$DEV_PROJECT" config --quiet
```

Do not use outputting `docker compose config`, raw `docker inspect`, or environment dumps. Production database, image, proxy, backup, migration, and rollback work is governed by `docs/runbooks/submissions-database.md`; repository checks do not authorize those operations.

## Notes For Agents

- Keep the Go backend and Vite frontend as separate local dev processes.
- Do not commit `frontend/node_modules/`, `frontend/dist/`, `data/`, or local log files.
- Prefer small, focused changes and run the relevant checks before committing.
- Keep privacy/support copy aligned when changing local data, access, or submission behavior.
- Never run database audit/reconciliation against repository `data/`, a live volume, or an authoritative database. Use only a dedicated copied fixture under the runbook's identity and ownership gates.
