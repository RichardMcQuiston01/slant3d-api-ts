# CHANGELOG

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

## Unreleased

### Added

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
- `GET /filaments` returns `imageURL: ""` instead of omitting it when a
  filament has no image.
