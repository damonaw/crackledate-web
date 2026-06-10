# Crackle Date

This repo contains the deployable web version of Crackle Date for `crackledate.com`, a shared
TypeScript game core, and the Expo Native Android app.

## Screenshots

<p>
  <img src="docs/screenshots/game-empty-prompt.jpg" alt="Crackle Date game board with an empty equation prompt" width="300">
  <img src="docs/screenshots/fraction-selection.jpg" alt="Crackle Date equation editor with a selected fraction" width="300">
  <img src="docs/screenshots/settings-panel.jpg" alt="Crackle Date settings panel" width="300">
</p>

## Stack

- React + Vite frontend for the playable browser board.
- Go backend for puzzle date metadata, expression evaluation, and equation validation.
- Shared TypeScript core in `packages/crackledate-core/` for offline puzzle generation, equation
  evaluation, validation, editor helpers, badges, and submission payload types.
- Expo Native Android app in `apps/android/` for offline play with local SQLite persistence and
  queued anonymous solve submissions.
- A single Docker image serves the React build and `/api/*` routes.

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

Install workspace dependencies from the repo root:

```bash
npm install
```

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

Android:

```bash
npm --workspace @crackledate/android start
```

The Android app uses Expo Router and can run in Expo Go for local UI work. It saves solved puzzles
locally with SQLite, then retries anonymous `/api/submissions` uploads when connectivity returns.

## Environment

- `PORT`: backend HTTP port; defaults to `8080`.
- `SUBMISSIONS_PATH`: newline-delimited JSON store for submitted solutions; defaults to `data/submissions.ndjson` locally and `/data/submissions.ndjson` in Docker.
- `CLIENT_HASH_SECRET`: optional salt for rotating request-log client hashes. Set this in production so daily and weekly client hashes cannot be compared across deployments.

## Docker

```bash
docker compose up --build -d
curl -I http://127.0.0.1:8082
```

The compose file binds the container to loopback so it is intended to be reached through the host's reverse proxy rather than directly exposed.

## Routes

- `/` playable Crackle Date board
- `/date/YYYY-MM-DD` playable board for a specific puzzle date
- `/privacy/` privacy policy
- `/support/` support page
- `/api/health`
- `/api/puzzle?date=YYYY-MM-DD`
- `/api/evaluate`
- `/api/validate`
- `/api/submissions`

Successful web, iOS, and Android solves may be posted to `/api/submissions` after local save. The
backend validates the equation before appending an anonymous JSON line to `SUBMISSIONS_PATH`, which defaults to
`/data/submissions.ndjson` in Docker and `data/submissions.ndjson` for local `go run`. The Docker
Compose service uses a named `submissions` volume so submitted solutions survive rebuilds.

The frontend treats `/date/YYYY-MM-DD` as the canonical URL for a selected puzzle date. The
compatibility entry point `/?date=YYYY-MM-DD` is accepted on load and normalized to the canonical
route. Choosing today's date returns the browser URL to `/`.

## Advertising Notes

Crackle Date may add advertising around archive play, especially when a visitor chooses a puzzle
date more than a week before the current date. Do not describe the site as always ad-free in public
copy, privacy text, release notes, or agent handoff docs.

See `docs/ads.md` for the current integration recommendation and privacy/security checklist before
adding third-party ad scripts, publisher IDs, consent messaging, or `ads.txt`.

## Checks

```bash
go test ./...
npm --workspace @crackledate/core test
npm --workspace @crackledate/core run build
npm --workspace @crackledate/android test
npm --workspace @crackledate/android run build
npm --workspace frontend test
npm --workspace frontend run build
```

For Android release readiness, run:

```bash
npm --workspace @crackledate/android run doctor
npx eas-cli@latest build -p android --profile production
```
