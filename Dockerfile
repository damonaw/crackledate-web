FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN npm run build

FROM golang:1.25-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
COPY internal ./internal
COPY cmd ./cmd
COPY --from=frontend /src/frontend/dist ./cmd/server/public
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/crackledate-web ./cmd/server

FROM alpine:3.21
ARG VCS_REVISION=unknown
LABEL org.opencontainers.image.revision="${VCS_REVISION}"
RUN adduser -D -H -u 10001 crackledate
USER crackledate
WORKDIR /app
COPY --from=backend /out/crackledate-web /app/crackledate-web
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/app/crackledate-web"]
