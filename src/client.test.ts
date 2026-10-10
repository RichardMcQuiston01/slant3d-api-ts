import { afterEach, describe, expect, it } from "bun:test";
import { Slant3dClient } from "./client.js";
import { Slant3dConfigError } from "./errors.js";
import { OrdersResource } from "./resources/orders.js";
import { FilesResource } from "./resources/files.js";
import { PlatformsResource } from "./resources/platforms.js";
import { createMockFetch, jsonResponse } from "./testing/mockFetch.js";

const ORIGINAL_ENV_TOKEN: string | undefined = process.env.SLANT3D_API_TOKEN;

describe("Slant3dClient", () => {
  afterEach(() => {
    if (ORIGINAL_ENV_TOKEN === undefined) {
      delete process.env.SLANT3D_API_TOKEN;
    } else {
      process.env.SLANT3D_API_TOKEN = ORIGINAL_ENV_TOKEN;
    }
  });

  it("throws Slant3dConfigError when no token is available", () => {
    delete process.env.SLANT3D_API_TOKEN;
    expect(() => new Slant3dClient()).toThrow(Slant3dConfigError);
  });

  it("accepts an explicit apiToken option", () => {
    delete process.env.SLANT3D_API_TOKEN;
    expect(() => new Slant3dClient({ apiToken: "abc123" })).not.toThrow();
  });

  it("falls back to the SLANT3D_API_TOKEN environment variable", () => {
    process.env.SLANT3D_API_TOKEN = "env-token";
    expect(() => new Slant3dClient()).not.toThrow();
  });

  it("instantiates each resource sub-client", () => {
    const client = new Slant3dClient({ apiToken: "abc123" });
    expect(client.files).toBeInstanceOf(FilesResource);
    expect(client.orders).toBeInstanceOf(OrdersResource);
    expect(client.platforms).toBeInstanceOf(PlatformsResource);
  });

  it("wires the injected fetch through to resources", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { success: true, message: "ok", data: {} }),
    );
    const client = new Slant3dClient({ apiToken: "abc123", fetch });

    await client.health.status();

    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/health/status");
  });
});
