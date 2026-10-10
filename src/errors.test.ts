import { describe, expect, it } from "bun:test";
import {
  Slant3dApiError,
  Slant3dAuthenticationError,
  Slant3dAuthorizationError,
  Slant3dNotFoundError,
  Slant3dRateLimitError,
  Slant3dValidationError,
  mapHttpError,
  parseRetryAfterMs,
} from "./errors.js";

describe("mapHttpError", () => {
  it("maps 401 to Slant3dAuthenticationError", () => {
    const error = mapHttpError(401, { message: "bad token" }, "/orders");
    expect(error).toBeInstanceOf(Slant3dAuthenticationError);
    expect(error.status).toBe(401);
    expect(error.requestPath).toBe("/orders");
    expect(error.message).toBe("bad token");
  });

  it("maps 403 to Slant3dAuthorizationError", () => {
    expect(mapHttpError(403, {}, "/orders")).toBeInstanceOf(
      Slant3dAuthorizationError,
    );
  });

  it("maps 404 to Slant3dNotFoundError", () => {
    expect(mapHttpError(404, {}, "/orders/123")).toBeInstanceOf(
      Slant3dNotFoundError,
    );
  });

  it("maps 400 and 422 to Slant3dValidationError", () => {
    expect(mapHttpError(400, {}, "/orders")).toBeInstanceOf(
      Slant3dValidationError,
    );
    expect(mapHttpError(422, {}, "/orders")).toBeInstanceOf(
      Slant3dValidationError,
    );
  });

  it("maps 429 to Slant3dRateLimitError and parses Retry-After", () => {
    const headers = new Headers({ "Retry-After": "5" });
    const error = mapHttpError(429, {}, "/orders", headers);
    expect(error).toBeInstanceOf(Slant3dRateLimitError);
    expect((error as Slant3dRateLimitError).retryAfterMs).toBe(5000);
  });

  it("maps unknown statuses to the generic Slant3dApiError", () => {
    const error = mapHttpError(500, {}, "/orders");
    expect(error.constructor).toBe(Slant3dApiError);
  });

  it("falls back to a generic message when the body has no message field", () => {
    const error = mapHttpError(500, { foo: "bar" }, "/orders");
    expect(error.message).toBe("Slant3D API request failed with status 500");
  });

  it("combines message and error detail from the V2 error envelope", () => {
    const error = mapHttpError(
      400,
      { success: false, message: "Validation failed", error: "zip is required" },
      "/orders",
    );
    expect(error.message).toBe("Validation failed: zip is required");
  });

  it("reads a nested error.message, as returned by GET /filaments", () => {
    const error = mapHttpError(
      400,
      { success: false, error: { message: "Unapproved Profile", statusCode: 400 } },
      "/filaments",
    );
    expect(error.message).toBe("Unapproved Profile");
  });
});

describe("parseRetryAfterMs", () => {
  const NOW = Date.parse("2015-10-21T07:00:00Z");
  const parse = (value: string): number | undefined =>
    parseRetryAfterMs(new Headers({ "Retry-After": value }), NOW);

  it("parses delta-seconds", () => {
    expect(parse("5")).toBe(5000);
    expect(parse("0")).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    expect(parse("Wed, 21 Oct 2015 07:28:00 GMT")).toBe(28 * 60 * 1000);
  });

  it("treats a date in the past as an immediate retry", () => {
    expect(parse("Wed, 21 Oct 2015 06:00:00 GMT")).toBe(0);
  });

  it("returns the full delta for huge values; the client clamps it", () => {
    expect(parse("3000000")).toBe(3_000_000_000);
  });

  it("ignores negative, non-finite, and unparseable values", () => {
    expect(parse("-5")).toBeUndefined();
    expect(parse("Infinity")).toBeUndefined();
    expect(parse("1".repeat(400))).toBeUndefined();
    expect(parse("soon")).toBeUndefined();
    expect(parseRetryAfterMs(new Headers(), NOW)).toBeUndefined();
  });
});
