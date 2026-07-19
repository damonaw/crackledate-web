# Web Release and Calendar History Design

**Date:** July 18, 2026

**Repository:** `crackledate-web`

**Status:** Design approved; written specification awaiting review

## Goal

Finish the web release as a stateless service with browser-local gameplay history, remove the standalone Stats and Saved Solutions page, and make Calendar the single place for reviewing saved equations. The Calendar page adds one average-time card for the selected day.

## Product Contract

- Crackle Date has no ads, purchases, accounts, tracking, public profiles, achievement badges, or cloud gameplay history.
- Saved equations, solve times, streak calculations, settings, theme, difficulty, and onboarding progress remain only in browser storage.
- Practice does not save a daily solution or change history or streaks.
- The web service may process the current puzzle, equation, validation, or hint request, but retains no gameplay content after responding.
- Operational logs contain only the approved minimal request fields and no gameplay content or client identifier.
- The former production submissions volume is detached during the stateless deployment but is not opened, copied, deleted, or otherwise modified by this release.

## Calendar-First History

The toolbar no longer contains a Stats destination. The `solutions` active view, standalone Saved Solutions page, global history summary, Stats icon, and their page-only styles and tests are removed.

Calendar remains the date-selection and history surface. Beneath the calendar, the selected date shows:

1. An `Average Time` card.
2. The existing list of locally saved equations for that date.
3. Existing share controls and ordinary Archive, Used Hint, Easy, and Hard tags.
4. The existing `Play this Date` action.

The average uses only selected-day solutions whose recorded duration is greater than zero. It is rounded to the nearest whole second and formatted with the existing time formatter. If the selected day has no positive recorded duration, the value is an em dash (`—`). The average is derived from current React state and is never persisted separately or sent to the server.

Existing buttons that previously opened Saved Solutions route to Calendar with the currently selected date. Calendar copy and instructions replace references to checking Stats or opening Saved Solutions.

Compact statistics embedded in the victory or daily dashboard are not standalone navigation and may remain where they support the immediate post-solve experience. Achievement concepts do not return.

## Stateless Server

The Go application registers only health, puzzle, evaluate, validate, and hint endpoints. Unknown `/api/` routes, including every method on `/api/submissions`, return a bounded JSON 404 and never reflect the request body. Static React fallback applies only outside `/api/`.

Runtime initialization reads only proxy trust and hint-concurrency configuration. It does not read submission-path, retirement, or client-hash settings and opens no gameplay store. SQLite, submission handlers, audit/reconcile commands, evidence packages used only by those binaries, and their dependencies are removed from the shipping server.

Request logs serialize exactly `timestamp`, `level`, `method`, normalized `path`, `status`, and `durationMs`. They exclude query strings, request bodies, equations, solutions, hint prefixes, network addresses or hashes, country, Cloudflare Ray ID, user agent, and referrer. Network addresses may exist only temporarily in bounded in-memory rate-limit counters.

## Packaging and Deployment

The final Docker image contains only the web server binary and static frontend. It has no `/data` setup, SQLite driver, submission tools, storage environment variables, or mounts. Compose keeps one loopback-bound service with only proxy-trust and hint-concurrency environment settings.

Before cutover, the existing mounted container and previously captured volume fingerprint are reverified. The new immutable image is built and labeled with the exact Git revision. Deployment recreates the service without the submissions mount, then a stateless identity guard proves the image, revision, Compose labels, running state, zero mounts, forbidden-environment absence, and binary inventory.

After local and public smoke tests, metadata-only checks prove the former named volume has zero consumers. The volume remains intact and detached. Deletion requires a separate explicit confirmation and is outside this design.

## Copy and Documentation

Privacy, Support, Rules, How to Play, README, and AGENTS describe the same local-only/stateless model. History guidance points users to Calendar. Support explains that cleared browser data, private browsing, another browser, or another device cannot be restored from a server copy.

Historical submission/database plans remain clearly marked as superseded. The active decommission runbook covers only the guarded stateless cutover and the separately authorized deletion boundary.

## Error Handling

- Missing or untimed selected-day solutions render `Average Time —` without an error state.
- Failed local save/readback does not update history, averages, dashboard state, or success claims.
- Practice remains excluded from Calendar history and averages.
- Hint timeout, no-solution, rate-limit, and cancellation behavior remains bounded and preserves the current equation.
- Unknown API paths return JSON 404 rather than the React application.
- Any image-build, identity, mount, log, proxy, health, or smoke-test mismatch blocks release promotion.

## Test and Release Evidence

Implementation follows red-green-refactor with focused commits for:

1. Calendar history and daily average behavior.
2. Server persistence and SQLite removal.
3. Minimal request logs.
4. Stateless image, Compose policy, and deployment identity.
5. Privacy/support/instruction/documentation alignment.
6. Browser flows and refreshed active screenshots.

The final gate includes all Go tests and race tests, canonical fixture checks, all frontend unit tests, production build, Chromium end-to-end flows, product/Compose/Docker-context policy tests, immutable Docker build, local stateless container smoke, public smoke, exact application-log schema, proxy-log policy review, and zero-consumer proof for the detached legacy volume.

Browser QA covers desktop and mobile Calendar states with no history, one timed solution, multiple timed solutions, untimed solutions, sharing, date changes, Play this Date, navigation without Stats, local data clearing, Privacy, and Support. The shipped release is committed and pushed to both `development` and `main` before the production host pulls the exact revision.
