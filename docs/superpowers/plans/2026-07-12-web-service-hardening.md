# CrackleDate Web Service Hardening Plan

Date: 2026-07-12

Repository: crackledate-web

Branch/base: development at 5ee5275

## Goal

Close the confirmed release blockers around unauthenticated hint-solver resource
abuse, spoofable client identity, unbounded limiter memory, incomplete HTTP
deadlines, unrecoverable browser network failures, stale retired-session
cookies, and undeleted legacy account/session schema.

Every task is test-first, independently reviewed, committed, and pushed before
the next task. The ignored live data/submissions.db is never used by tests or
modified by this plan.

## Security patch contract

Vulnerable paths:

1. Any client can repeatedly call GET /api/hint. The synchronous combinatorial
   solver runs, while current limiting only considers mutating methods and does
   not list the hint route.
2. A direct client can choose CF-Connecting-IP or X-Forwarded-For. The same
   spoofable identity controls rate limiting and request-log client hashes.
3. Limiter cleanup removes only stale entries, so active unique identities can
   grow the map indefinitely.
4. The server sets only ReadHeaderTimeout. Body reads, writes, keep-alive idle
   periods, and header size retain broad defaults.
5. The browser has competing hint fetch paths and does not consistently
   distinguish no-solution, throttling, server, malformed-response, abort, and
   network outcomes. Validation does not catch fetch rejection or check
   response.ok.
6. Removed auth cookies and SQLite account tables can survive deployment because
   the named data volume persists and startup only creates submission objects.

Security invariants:

- Expensive hint work is bounded per resolved client and globally.
- Limiter memory stays at or below its configured capacity under identity churn.
- Forwarding and Cloudflare headers affect identity/metadata only for an
  explicitly trusted immediate peer.
- Oversized or malformed hint inputs are rejected before solver work.
- Connection lifetime and header memory have explicit shipping bounds.
- Aborted, superseded, throttled, and failed browser requests cannot overwrite
  newer UI or erase equation/onboarding state.
- Legacy retirement is disabled by default, transactional, idempotent,
  submission-preserving, and fail-closed when linked account data exists.

Legitimate behavior to preserve:

- Valid puzzle, evaluate, validate, submission, and three-step hint behavior.
- Existing POST limits and public JSON success shapes.
- Direct deployment with RemoteAddr and no proxy configuration.
- Correctly configured proxy/Cloudflare client resolution.
- Hint 404 as the genuine no-solution result.
- Equation, date, saved data, and onboarding state across temporary failures.
- Every retained submission row and field through allowed retirement.

## Fixed repository defaults

- GET /api/hint: 30 requests/minute/resolved client.
- Limiter: 4,096 method/path/client entries with true LRU eviction.
- Concurrent hint solves: 4. MAX_CONCURRENT_HINT_SOLVES may override only with
  a strict integer in 1...16.
- Trusted proxies: none. TRUSTED_PROXY_CIDRS identifies generic proxies that
  may contribute only X-Forwarded-For. TRUSTED_CLOUDFLARE_PROXY_CIDRS
  separately identifies peers allowed to supply CF-Connecting-IP,
  CF-IPCountry, and CF-Ray. Both lists are strictly parsed; any invalid CIDR
  prevents startup before the database is opened.
- Hint bounds: raw query 1,024 bytes; date 32; mode 32; targetValue 64; prefix
  256 bytes.
- Server: ReadHeaderTimeout 5s, ReadTimeout 10s, WriteTimeout 30s,
  IdleTimeout 60s, MaxHeaderBytes 32 KiB.
- Reactive hint debounce: 300 ms.
- Retirement activation: exact RETIRE_LEGACY_ACCOUNT_DATA=confirmed only.

Environment-specific proxy CIDRs, cookie compatibility release/window, backup
owner/location/retention, and disposition of detected linked data remain
explicit owner/operations decisions.

## Task 1: Bound and authenticate the hint boundary

Interface: produces validated runtime security config, a shared client resolver,
a bounded method/path limiter, and an injected/bounded hint handler consumed by
main server assembly and later documentation.

Files:

- Create cmd/server/client_address.go
- Create cmd/server/rate_limit.go
- Create cmd/server/hint_handler.go
- Create cmd/server/runtime_config.go
- Modify cmd/server/main.go
- Modify cmd/server/security_test.go
- Modify cmd/server/analytics_test.go
- Modify cmd/server/hint_test.go

RED tests:

- TestHandleHintRejectsNonGET
- TestHandleHintRejectsEachOversizedOrMalformedQueryBeforeSolve
- TestHandleHintReturnsValidJSONForValidQuery
- TestHandleHintReturns404ForGenuineNoSolution
- TestHandleHintLimitsConcurrentSolverWork
- TestHandleHintReleasesSolveSlotAfterCompletion
- TestRateLimitAPIRestrictsHintGET
- TestRateLimitAPIIsMethodAndPathSpecific
- TestRateLimiterNeverExceedsConfiguredCapacity
- TestRateLimiterEvictsLeastRecentlyUsedEntry
- TestClientAddressIgnoresForwardedHeadersFromUntrustedPeer
- TestClientAddressUsesCloudflareHeaderFromTrustedCloudflarePeer
- TestClientAddressIgnoresCloudflareHeaderFromGenericTrustedPeer
- TestClientAddressWalksForwardedChainRightToLeft
- TestClientAddressRejectsMalformedForwardedAddress
- TestTrustedProxyConfigRejectsInvalidCIDR
- TestHintConcurrencyConfigUsesDefaultWhenUnset
- TestHintConcurrencyConfigAcceptsOneAndSixteen
- TestHintConcurrencyConfigRejectsZeroSeventeenNonIntegerAndMalformedValues
- TestInvalidRuntimeConfigStopsBeforeOpeningSubmissionStore
- TestRequestLoggerIgnoresCloudflareMetadataFromUntrustedPeer
- TestRequestLoggerUsesSharedTrustedClientResolution

Inject a solver function/channel so concurrency is deterministic. Every raw,
date, mode, target-value, decoded-prefix, malformed-encoding, and encoded-bypass
rejection must assert a zero solver call count; valid 200 and genuine 404 tests
must exercise that same handler boundary.

~~~bash
go test ./cmd/server -run 'Test(HandleHint|RateLimit|RateLimiter|ClientAddress|TrustedProxy|HintConcurrency|InvalidRuntimeConfig|RequestLogger)' -count=1
~~~

GREEN implementation:

- Parse all runtime security configuration before opening the submission store
  or constructing a listening server. Test unset/default, valid boundary, and
  invalid concurrency/CIDR configuration.
- A generic trusted proxy may contribute only X-Forwarded-For. Walk its chain
  right-to-left to the first non-trusted address. Only a peer in the separate
  Cloudflare allowlist may supply CF-Connecting-IP or trusted CF metadata.
  Direct/untrusted callers fall back to normalized RemoteAddr.
- The deployment gate must verify that every configured proxy overwrites or
  canonically appends forwarding headers; merely knowing its CIDR is not enough.
- Key limits by method, path, and client. Preserve POST limits and add hint GET.
- Use map plus linked-list LRU with O(1) update/eviction and a hard 4,096 cap.
- Enforce GET and query bounds before acquiring a solve slot.
- Size the process gate from validated runtime configuration (default four). If
  full, return 503 with Retry-After: 1 and do not start solver work. Release on
  every outcome.
- Preserve valid hint JSON and real 404 behavior.

~~~bash
go test ./cmd/server -run 'Test(HandleHint|RateLimit|RateLimiter|ClientAddress|TrustedProxy|HintConcurrency|InvalidRuntimeConfig|RequestLogger)' -count=1
go test ./cmd/server -count=1
go test ./internal/game -count=1
gofmt -w cmd/server/*.go
git diff --check
~~~

Bypass review: alternate methods, invalid/spoofed IP forms, generic-proxy CF
spoofing, unique-client churn, trusted chains, encoded oversize values, startup
ordering, configuration boundaries, and slot release.

Commit: fix(server): trust and bound hint requests

## Task 2: Configure the complete HTTP envelope

Interface: consumes the final assembled handler and produces the only shipping
http.Server constructor.

Files:

- Create cmd/server/http_server.go
- Create cmd/server/http_server_test.go
- Modify cmd/server/main.go

RED: TestNewHTTPServerUsesShippingLimits asserts address/handler and every exact
timeout/header limit.

~~~bash
go test ./cmd/server -run TestNewHTTPServerUsesShippingLimits -count=1
~~~

GREEN: construct the server through newHTTPServer and set the fixed
5/10/30/60-second deadlines plus 32 KiB header ceiling. Do not add a generic
handler timeout that would leave solver work running; the global solve gate is
the CPU boundary.

~~~bash
go test ./cmd/server -run TestNewHTTPServerUsesShippingLimits -count=1
go test ./...
gofmt -w cmd/server/*.go
git diff --check
~~~

Commit: fix(server): configure complete HTTP limits

## Task 3: Unify, cancel, and debounce hint requests

Interface: consumes existing hint-flow semantics and produces one typed request
and coordination path for every hint caller in GamePage.

Files:

- Create frontend/src/hintRequest.ts and hintRequest.test.ts
- Create frontend/src/hintRequestCoordinator.ts and its test
- Modify frontend/src/hintFlow.ts and its test
- Modify frontend/src/main.tsx
- Modify frontend/src/hintLoadingSurface.test.ts
- Modify frontend/src/hintUnavailableCopy.test.ts

RED coverage:

- AbortSignal forwarding; abort creates no feedback.
- 404 -> no_solution, 429 -> rate_limited, network/5xx/malformed -> temporary.
- Exact 300 ms reactive debounce.
- Immediate cancellation on equation, puzzle, close, unmount, new request,
  active-view navigation (Home, Rules, Settings, and other destinations),
  Practice/daily context switches, restart, and Clear Data.
- Identical query coalescing and same-tick click suppression.
- Sequence guard prevents stale response replacement.
- No duplicate initial request when hintStep changes 0 -> 1.
- Existing three-step flow and true-dead-end copy remain unchanged.

~~~bash
cd frontend
npm test -- hintRequest.test.ts hintRequestCoordinator.test.ts hintFlow.test.ts hintLoadingSurface.test.ts hintUnavailableCopy.test.ts
~~~

GREEN: one typed helper and coordinator serve both explicit clicks and reactive
prefix refresh. Its request identity includes active view, puzzle date,
Practice/daily mode, equation, and generation. Button requests are immediate;
reactive refresh alone is debounced. Throttled/temporary feedback is
recoverable, never a dead end.

~~~bash
npm test -- hintRequest.test.ts hintRequestCoordinator.test.ts hintFlow.test.ts hintLoadingSurface.test.ts hintUnavailableCopy.test.ts
npm test
npm run build
git diff --check
~~~

Commit: fix(web): cancel and debounce hint requests

## Task 4: Preserve state across validation failures

Interface: consumes the existing validation JSON contract and onboarding
completion callback, and produces one cancellable/sequence-safe validation path.

Files:

- Create frontend/src/validationRequest.ts and its test
- Create frontend/src/validationRequestCoordinator.ts and its test
- Modify frontend/src/main.tsx
- Modify frontend/src/validationFeedbackSurface.test.ts
- Modify frontend/src/firstRunOnboardingWiring.test.ts
- Modify frontend/src/styles.css only if loading/disabled presentation needs it

RED covers typed 200 success, 200 valid=false equation feedback, request-level
400 error JSON, 429, 5xx, malformed JSON, network rejection, and abort. Prove
one request in flight, silent abort, retained tokens/date/data/onboarding,
successful retry, and required-Practice completion ordering. The coordinator
must cancel and sequence-guard on equation, puzzle date, active view,
Practice/daily context, onboarding transition, restart/reset/Clear Data, and
unmount so a captured response cannot update feedback or complete onboarding
after its context is stale.

Copy:

- 429: Too many checks at once. Please wait a moment and try again.
- Other temporary failure: Could not check this equation right now. Your
  equation is still here—try again.

~~~bash
cd frontend
npm test -- validationRequest.test.ts validationRequestCoordinator.test.ts validationFeedbackSurface.test.ts firstRunOnboardingWiring.test.ts guidedPractice.test.ts
~~~

GREEN: use one typed helper plus a testable AbortController/generation
coordinator, explicit response.ok handling, and an in-flight guard. Current
equation validation feedback is HTTP 200 with valid=false/errorMessage. HTTP
400 is malformed request/date error JSON and remains distinct; 429/5xx never
become an invalid-equation result.

~~~bash
npm test -- validationRequest.test.ts validationRequestCoordinator.test.ts validationFeedbackSurface.test.ts firstRunOnboardingWiring.test.ts guidedPractice.test.ts
npm test
npm run build
git diff --check
~~~

Commit: fix(web): make validation failures recoverable

## Task 5: Expire retired session cookies for one release

Interface: produces outer compatibility middleware consumed by all API/static
routes without reviving any auth behavior.

Files:

- Create cmd/server/legacy_session_cookie.go and its test
- Modify cmd/server/main.go

RED: an incoming crackledate_session receives one expired empty cookie with
Path=/, past Expires, negative MaxAge, HttpOnly, and SameSite=Lax. No incoming
cookie means no Set-Cookie. Preserve downstream status/body and cover API/static
routes.

~~~bash
go test ./cmd/server -run TestExpireLegacySessionCookie -count=1
~~~

GREEN: outer middleware expires only a received legacy cookie. Document the
one-release removal follow-up.

~~~bash
go test ./cmd/server -run TestExpireLegacySessionCookie -count=1
go test ./...
gofmt -w cmd/server/*.go
git diff --check
~~~

Commit: fix(server): expire retired session cookies

## Task 6: Retire unlinked legacy account schema safely

Interface: consumes a newly opened submission store plus validated activation
state and produces either an unchanged store, a verified retired schema, or a
startup-blocking error before traffic.

Files:

- Create cmd/server/legacy_retirement.go and its test
- Modify cmd/server/submissions.go
- Modify cmd/server/main.go

All tests use temporary SQLite fixtures, never data/submissions.db.

RED coverage:

- Disabled/unrecognized activation changes nothing.
- Exact confirmed activation is required.
- Absent objects are an idempotent no-op.
- Any user_solutions rows refuse and roll back.
- Any non-null submission_attempts.user_id refuses and rolls back.
- An unlinked fixture drops email_verifications, sessions, user_preferences,
  user_solutions, and users; removes legacy user-id index/column; preserves
  every retained submission field.
- Current PRAGMA table_info constraints/defaults, required current indexes, and
  AUTOINCREMENT/sqlite_sequence high-water state remain equivalent; only the
  retired user-id column/index may disappear.
- Partial legacy variants (some tables/indexes absent, nullable user_id present,
  and a high sequence with sparse rows) either migrate safely or refuse before
  mutation with a named unsupported variant.
- Running twice succeeds.
- Forced mid-transaction error fully rolls back.
- New submissions append afterward.
- NDJSON is unaffected.

~~~bash
go test ./cmd/server -run 'TestLegacy(Account|Database|Retirement)' -count=1
~~~

GREEN:

- Run only for SQLite and exact activation.
- Log counts only, never values.
- Refuse before mutation if linked data exists.
- For unlinked schema, record count plus a canonical digest in id order using
  explicit NULL markers and length-prefixed field encodings for every retained
  submission field. Inspect PRAGMA table_info, index_list/index_info, and
  sqlite_sequence before mutation. Prefer native transactional column drop;
  verify retained constraints/indexes/sequence and the same count/digest before
  commit. Only temporary-fixture tests append a post-migration row; production
  retirement never inserts a synthetic submission.
- Never VACUUM at startup.
- Surface enabled retirement errors before serving traffic.

~~~bash
go test ./cmd/server -run 'TestLegacy(Account|Database|Retirement)' -count=1
go test ./...
gofmt -w cmd/server/*.go
git diff --check
~~~

Commit: fix(server): retire unlinked legacy account data

## Task 7: Add deployment, backup, and rollback runbook

Interface: consumes every new environment/operational boundary and produces the
shipping configuration, build-context exclusions, and safe activation runbook.

Files:

- Create docs/runbooks/submissions-database.md
- Modify .dockerignore
- Create scripts/verify_dockerignore.sh
- Modify README.md
- Modify AGENTS.md
- Modify docker-compose.yml

Document:

- Proxy/concurrency settings and safe defaults.
- Separate generic-proxy and Cloudflare-proxy CIDRs, plus an operational test
  proving the configured proxy overwrites/appends forwarding headers safely.
- How to identify the immediate proxy CIDR without trusting public headers.
- Service quiesce; actual Compose project/volume; encrypted timestamped backup;
  SHA-256; PRAGMA quick_check; schema/row inventory; temporary restore drill.
- Pre/post submission count and digest.
- One-shot retirement maintenance deployment and expected linked-data refusal.
- Rollback by stop, restore, prior image, and flag removal.
- Offline VACUUM only after backup/free-space checks.
- Backup access, owner, retention, and deletion approval.
- Cookie middleware removal after the identified release.
- Docker build-context exclusions for data/, *.db, SQLite WAL/SHM files, local
  logs, and other runtime data before any local or remote image build.

~~~bash
scripts/verify_dockerignore.sh
docker compose config
git diff --check
~~~

Commit: docs(ops): add submissions retirement runbook

## Final verification and runtime QA

Ordered security verification:

1. Applicability/buildability: final diff, focused Go/frontend tests.
2. Closure: unrestricted hint GET, generic-proxy CF spoofing, malformed runtime
   config, churn, saturation, every bounded/malformed query variant, stale
   hint/validation response, and linked-DB triggers are rejected at the
   intended boundary.
3. Bypass review: alternate methods, encoded parameters, invalid chains, direct
   CF headers, LRU churn, slot release, stale responses, retirement rerun.
4. Preserved behavior: valid three-step hints, trusted proxy identity, equation
   feedback/retry, submissions/static routes, disabled retirement.
5. Repository gates:

~~~bash
gofmt -w cmd/server/*.go
go test ./...
cd frontend
npm test
npm run build
cd ..
docker compose config
scripts/verify_dockerignore.sh
docker build -t crackledate-web:ship-check .
git diff --check
~~~

Browser QA at 390x844 and 1280x900 intercepts hint 404/429/503/500/slow/
malformed/aborted/out-of-order responses and validation network/429/500 then a
successful retry. Confirm no stale hint UI, equation/onboarding retention, and
legacy-cookie clearing. Capture materially changed failure states and require a
clean console.

Before the Docker build, the repository script must parse .dockerignore and
require exclusions for data/, SQLite database/WAL/SHM files, and local logs.
It must use only synthetic paths/fixtures and never open, copy, hash, or create
anything under the live data directory.

Database QA uses only a copied/temp fixture. Production activation stays blocked
until actual schema/count inventory, linked-data disposition, backup owner/
location/retention, maintenance window, both proxy CIDR classes and sanitizer
behavior, and cookie-release identifier are recorded.

The repo-controlled milestone is complete only after every task has independent
review approval, final gates and browser QA pass, the branch is clean/synced,
and external deployment blockers are explicit rather than assumed.
