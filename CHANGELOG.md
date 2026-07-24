# CHANGELOG

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
