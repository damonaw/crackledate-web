FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM golang:1.23-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
COPY internal ./internal
COPY cmd ./cmd
COPY --from=frontend /src/frontend/dist ./cmd/server/public
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/crackledate-web ./cmd/server

FROM alpine:3.21
RUN adduser -D -H -u 10001 crackledate \
    && mkdir -p /data \
    && chown crackledate:crackledate /data
USER crackledate
WORKDIR /app
COPY --from=backend /out/crackledate-web /app/crackledate-web
EXPOSE 8080
ENV PORT=8080
ENV SUBMISSIONS_PATH=/data/submissions.db
ENTRYPOINT ["/app/crackledate-web"]
