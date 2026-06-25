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
- Optional accounts, local saves, a `$1.99` supporter option, sponsor banners for past dates and repeat current-date solves, a 30-second sponsor unlock for future dates, a Practice sandbox, and written Rules.

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
- `SUBMISSIONS_PATH`: storage target for submission attempts and accounts. `.db`/`.sqlite`/`.sqlite3` enables SQLite rows and account features. Defaults to `data/submissions.db` locally and `/data/submissions.db` in Docker.
- `CLIENT_HASH_SECRET`: optional salt for rotating request-log client hashes. Set this in production so daily and weekly client hashes cannot be compared across deployments.
- `PUBLIC_BASE_URL`: public site origin used in verification emails, for example `https://crackledate.com`.
- `SESSION_COOKIE_SECURE`: set to `true` in production so auth cookies are marked Secure behind HTTPS.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`: SMTP settings for verification emails. If SMTP is not configured, verification links/codes are logged to stderr for development.

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
- `/api/auth/signup`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/verify`
- `/api/auth/verify-code`
- `/api/auth/resend-verification`
- `/api/me/preferences`
- `/api/me/solutions`
- `/api/me/solutions/import`

Web attempts are posted to `/api/submissions`. The backend validates the equation and stores each attempt
in `SUBMISSIONS_PATH` with `submissionStatus` (`accepted` or `rejected`) and `rejectionReason` for failures.
Browser-local duplicate rejections can include `clientRejectionReason`, but accepted/rejected status is
computed by the server. The default storage target is `/data/submissions.db` in Docker and
`data/submissions.db` for local `go run`. The Docker compose service uses a named `submissions` volume
so submitted data survive rebuilds.

JSON API request bodies are capped at 32 KiB. POST requests are also rate-limited per client IP for the
submission, validation, and evaluation routes to reduce spam and resource-exhaustion attempts.

Accounts are optional. Email/password accounts require email verification by either clicking the emailed
link or entering the emailed 6-digit code. Passwords must be at least 8 characters and are stored with
Argon2id hashes. Verified accounts can sync saved solutions, submission attempts, theme preference, and
difficulty mode.

Monetization is date-based and limited: the supporter option is `$1.99` and does not
remove date-based ads. Past dates can show a banner ad, the current date can show a banner after
one saved solution, and future dates can require a 30-second sponsor ad before play.

Practice is a sandbox reachable from Settings. It uses the shared June 19, 2026 sample
round and validates equations without saving progress, syncing account data, or submitting
the attempt to the backend.

Rules is a written Settings destination separate from Cracked Instructions. It documents
digit order, the equals-sign requirement, practice boundaries, and date-based ad boundaries.

Share payloads follow the shared Android contract: daily shares include progress without
revealing the equation, while saved-solution shares include the equation, value, and solve time.

The post-solve panel is the web Daily Dashboard: it uses Android-aligned selected-date
summary copy, streak/month cards, next badge target copy, spoiler-free daily sharing,
and actions for keep playing, saved solutions, and calendar.
