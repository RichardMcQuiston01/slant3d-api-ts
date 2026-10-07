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

- Initial `Slant3dClient` v1: quotes/pricing, order creation, and order
  tracking sub-clients, backed by a shared `HttpClient` with typed error
  classes and no automatic retries (order creation is non-idempotent).
- `FilamentColor` and Slant3D webhook payload types for consumers, without
  client methods where no confirmed endpoint exists.
- README installation/quick-start docs and an accuracy caveat noting which
  endpoints are confirmed vs. best-guess placeholders.
- GitHub Actions CI running typecheck/lint/test on PRs and pushes to
  `dev`/`staging`/`release`/`main`.
