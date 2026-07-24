import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { TrackingResource } from "./tracking.js";

describe("TrackingResource", () => {
  it("gets the (unverified) guessed order/{orderId} path and returns the typed response", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { orderId: "order-123", status: "printing" }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
    const tracking = new TrackingResource(client);

    const result = await tracking.getStatus("order-123");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "https://www.slant3dapi.com/api/order/order-123",
    );
    expect(result).toEqual({ orderId: "order-123", status: "printing" });
  });
});
