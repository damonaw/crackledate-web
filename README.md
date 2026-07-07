# Crackle Date Web

This is the deployable web version of Crackle Date for `crackledate.com`.

## Screenshots

<p>
  <img src="docs/screenshots/game-empty-prompt.jpg" alt="Crackle Date game board with an empty equation prompt" width="300">
  <img src="docs/screenshots/fraction-selection.jpg" alt="Crackle Date equation editor with a selected fraction" width="300">
  <img src="docs/screenshots/settings-panel.jpg" alt="Crackle Date settings panel" width="300">
</p>

## Stack

- React + Vite frontend for the playable browser board.
- Go backend for puzzle date metadata, expression evaluation, and equation validation.
- A single Docker image serves the React build and `/api/*` routes.
- Guided First Crack onboarding, local saves, no ads or in-app purchases, open date access, a Practice sandbox, and written Rules.

This keeps the runtime small and simple: the single container can sit behind any HTTPS reverse proxy or tunnel, while React handles the equation-builder interaction.

## Local Development

Open the hot-reload local app at `http://localhost:5173/`.

From the repo root:

```bash
npm run dev
```

This starts the Go API on `http://localhost:5174` and the Vite frontend on
`http://localhost:5173`. Frontend changes hot reload through Vite, and backend
changes under `cmd/` or `internal/` restart the API automatically.

Override the API port with `CRACKLEDATE_API_PORT` if needed.

You can also run the two processes manually.

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Backend:

```bash
go run ./cmd/server
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

## Environment

- `PORT`: backend HTTP port; defaults to `8080`.
- `SUBMISSIONS_PATH`: storage target for anonymous submission attempts. `.db`/`.sqlite`/`.sqlite3` enables SQLite rows. Defaults to `data/submissions.db` locally and `/data/submissions.db` in Docker.
- `CLIENT_HASH_SECRET`: optional salt for rotating request-log client hashes. Set this in production so daily and weekly client hashes cannot be compared across deployments.

## Docker

```bash
docker compose up --build -d
curl -I http://127.0.0.1:8082
```

The compose file binds the container to loopback so it is intended to be reached through the host's reverse proxy rather than directly exposed.

## Routes

- `/` playable Crackle Date board
- `/privacy/` privacy policy
- `/support/` support page
- `/api/health`
- `/api/puzzle?date=YYYY-MM-DD`
- `/api/evaluate`
- `/api/validate`
- `/api/submissions`

Web attempts are posted to `/api/submissions`. The backend validates the equation and stores each attempt
in `SUBMISSIONS_PATH` with `submissionStatus` (`accepted` or `rejected`) and `rejectionReason` for failures.
Browser-local duplicate rejections can include `clientRejectionReason`, but accepted/rejected status is
computed by the server. The default storage target is `/data/submissions.db` in Docker and
`data/submissions.db` for local `go run`. The Docker compose service uses a named `submissions` volume
so submitted data survive rebuilds.

JSON API request bodies are capped at 32 KiB. POST requests are also rate-limited per client IP for the
submission, validation, and evaluation routes to reduce spam and resource-exhaustion attempts.

Crackle Date does not show ads or offer in-app purchases. Past, current, and future dates
open without paid unlocks.

Guided First Crack is the first-time web onboarding path. It uses the shared
Android/iOS route policy and starts the Practice Round guided tutorial, which highlights each
next step until the full sample solution is submitted.

Practice is a sandbox reachable from Settings and is also the guided tutorial. It uses the shared
June 19, 2026 sample round and validates equations without saving progress or submitting the
attempt to the backend.

Rules is a written Settings destination separate from Cracked Instructions. It documents
digit order, the leading-zero rule, the equals-sign requirement, practice boundaries,
and open date access without ads or purchases.

Share payloads follow the shared Android contract: daily shares include progress without
revealing the equation, while saved-solution shares include the equation, value, and solve time.

The post-solve panel is the web Daily Dashboard: it uses Android-aligned selected-date
summary copy, streak/month cards, next badge target copy, spoiler-free daily sharing,
and actions for keep playing, saved solutions, and calendar.
