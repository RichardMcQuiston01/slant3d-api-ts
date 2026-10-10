# CHANGELOG

## 0.3.0

### Removed (breaking)

- `account.listApiKeys` / `account.createApiKey`. The spec allows only the
  web session cookie on `/apiKey`, so every call with Bearer auth failed with
  a 401 that looked like a rejected key.

### Fixed

- `platforms.sendCustomWebhook` now posts to `/v2/slant/webhook` (the spec's
  operation-level server) instead of `/v2/api/slant/webhook`, which 404s. A
  custom `baseUrl` is honored. `spec:diff` now compares absolute URLs.
- Path ids of `.` or `..` are rejected with `Slant3dConfigError` instead of
  being resolved by the URL parser into a different endpoint.
- The request timeout now covers reading the response body, not only the
  headers. New `maxResponseBytes` option (throws
  `Slant3dResponseTooLargeError`).
- A 2xx response whose body is not JSON now throws `Slant3dApiError` instead
  of resolving with the raw string.
- `Retry-After` accepts HTTP-dates, ignores negative or invalid values, and
  is capped at 60 seconds.
- `files.upload` requires an `https:` presigned URL without embedded
  credentials, refuses redirects, applies the client timeout, and truncates
  the storage error body. `allowInsecureUploadUrl` exists for local tests.
- Webhook verification rejects timestamps too far in the future, compares raw
  digests, and uses fixed failure messages (no header or parser text).
  Parser errors are on `Slant3dWebhookError.cause`.

### Added

- `secret` for `verifyWebhookSignature` / `constructWebhookEvent` accepts an
  array, for verifying across a secret rotation.
- `dummy?: boolean` on webhook events (set on test webhooks).

## 0.2.0

### Changed (breaking)

- Rebuilt against the official Slant3D **V2** API
  (`https://slant3dapi.com/v2/api/`, OpenAPI 2.0.0). The v1 client targeted
  community-documented endpoints that do not exist in V2.
- Auth is now `Authorization: Bearer <key>` (was `Token <key>`).
- Removed `client.quotes` (use `client.files.estimate`) and
  `client.tracking` (use `client.orders.get` and webhooks).
- Order creation is now two steps: `orders.createDraft` then
  `orders.process`.
- Webhook types replaced with the V2 `event_type` / `service` payloads.

### Added

- Resources: `files` (incl. one-call `upload`, `estimate`, OpenSCAD to STL),
  `orders`, `platforms` (incl. webhook secret, test and dead-webhook
  endpoints), `components`, `filaments`, `stationery`, `account`, `health`.
- `constructWebhookEvent` / `verifyWebhookSignature` (HMAC-SHA256, constant
  time, timestamp tolerance, Web Crypto).
- Automatic retries with backoff for `GET` requests only.
- `Slant3dWebhookError`; V2 error envelope parsing.

### Fixed

- `.env.example` now uses `SLANT3D_API_TOKEN`, matching what the client reads.

### Added (contract tooling)

- `bun run spec:diff`: compares every client operation (method, path, query
  parameters, body properties) with the live OpenAPI spec and exits non-zero
  on drift. Also runs weekly in the `Spec drift` workflow.
- Offline contract tests in `contract/` covering the diff logic, client
  operation coverage, and response validation against spec schemas.
- Opt-in live contract tests (`bun run test:live`) that validate real API
  responses against the spec. Public and error-path checks need no key;
  read-only checks need `SLANT3D_API_TOKEN`; a file upload round trip also
  needs `SLANT3D_LIVE_WRITE=1` and `SLANT3D_LIVE_PLATFORM_ID`. No orders are
  created. Known, harmless differences between the live API and the spec are
  listed in `contract/knownDeviations.ts` and reported as warnings.

### Documented

- `account.listApiKeys` / `account.createApiKey` only work with a session
  cookie per the spec; with Bearer auth they return 401.
- `PATCH /files/{id}` and `DELETE /files/{id}` returned 403 "Admin access
  required" for a `free` role account acting on its own file, although the
  spec only requires the creator (and lists no 403 for `PATCH`). The live
  upload test therefore warns on those 403s and reuses one test file instead
  of deleting after each run.
- Platform `webhookURL` is `""` (not omitted) when unset.
- `GET /filaments` returns `imageURL: ""` instead of omitting it when a
  filament has no image.
