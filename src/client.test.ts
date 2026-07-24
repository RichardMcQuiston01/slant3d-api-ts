import { afterEach, describe, expect, it } from "bun:test";
import { Slant3dClient } from "./client.js";
import { Slant3dConfigError } from "./errors.js";
import { OrdersResource } from "./resources/orders.js";
import { QuotesResource } from "./resources/quotes.js";
import { TrackingResource } from "./resources/tracking.js";

const ORIGINAL_ENV_TOKEN = process.env.SLANT3D_API_TOKEN;

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
    expect(client.quotes).toBeInstanceOf(QuotesResource);
    expect(client.orders).toBeInstanceOf(OrdersResource);
    expect(client.tracking).toBeInstanceOf(TrackingResource);
  });
});
