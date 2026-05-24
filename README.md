# Crackle Date Web

This is the deployable web version of Crackle Date for `crackledate.com`.

## Stack

- React + Vite frontend for the playable browser board.
- Go backend for puzzle date metadata, expression evaluation, and equation validation.
- A single Docker image serves the React build and `/api/*` routes.

This fits the current deployment because the Alaska Home Server already fronts a local container through a Cloudflare Tunnel. Go keeps the runtime small and simple, while React is a good fit for the equation-builder interaction.

## Local Development

Frontend:

```bash
cd web/frontend
npm install
npm run dev
```

Backend:

```bash
cd web
go run ./cmd/server
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

## Docker

```bash
cd web
docker compose up --build -d
curl -I http://127.0.0.1:8082
```

The compose file binds the container to `127.0.0.1:8082`, matching the current Cloudflare Tunnel route on the home server.

## Routes

- `/` playable Crackle Date board
- `/privacy/` privacy policy
- `/support/` support page
- `/api/health`
- `/api/puzzle?date=YYYY-MM-DD`
- `/api/evaluate`
- `/api/validate`
