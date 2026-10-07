# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Slant3D API TypeScript Wrapper — a framework-agnostic TypeScript package for interacting with Slant3D's API service (see README.md).

## Current State

Client for the Slant3D **V2** API (`https://slant3dapi.com/v2/api/`). The spec is not stored in this repo; fetch it from `https://slant3dapi.com/v2/api/openapi.json` and keep `src/types.ts` and `src/resources/` aligned with it.

- `src/http/httpClient.ts`: fetch wrapper (Bearer auth, timeouts, `GET`-only retries, error mapping)
- `src/resources/*`: one class per API area, exposed on `Slant3dClient`
- `src/webhooks/*`: webhook payload types and signature verification
- Tests mock `fetch` via `src/testing/mockFetch.ts`

Use `bun` rather than `npm`. Commands: `bun run typecheck`, `bun run lint`, `bun test`, `bun run build`. Follow the user's `typescript-style` conventions.
