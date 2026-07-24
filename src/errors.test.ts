import { describe, expect, it } from "bun:test";
import {
  Slant3dApiError,
  Slant3dAuthenticationError,
  Slant3dAuthorizationError,
  Slant3dNotFoundError,
  Slant3dRateLimitError,
  Slant3dValidationError,
  mapHttpError,
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
});
