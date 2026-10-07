import { describe, expect, it } from "bun:test";
import {
  Slant3dAuthenticationError,
  Slant3dNetworkError,
  Slant3dRateLimitError,
  Slant3dTimeoutError,
  Slant3dValidationError,
} from "../errors.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { HttpClient } from "./httpClient.js";

describe("HttpClient", () => {
  it("joins the base URL and path, and sets the auth header", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { ok: true }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    await client.request("GET", "orders");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/orders");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer abc123");
  });

  it("serializes a JSON body and sets Content-Type when a body is given", async () => {
    const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    await client.request("POST", "orders", {
      body: { fileURL: "https://example.com/a.stl" },
    });

    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.body).toEqual({ fileURL: "https://example.com/a.stl" });
  });

  it("parses a JSON response body", async () => {
    const { fetch } = createMockFetch(() =>
      jsonResponse(200, { data: { price: 5.2 } }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    const result = await client.request<{ data: { price: number } }>(
      "GET",
      "orders",
    );

    expect(result).toEqual({ data: { price: 5.2 } });
  });

  it("falls back to raw text when the response body is not JSON", async () => {
    const { fetch } = createMockFetch(
      () => new Response("not json", { status: 200 }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    const result = await client.request("GET", "orders");

    expect(result).toBe("not json");
  });

  it("returns undefined for an empty response body", async () => {
    const { fetch } = createMockFetch(
      () => new Response(null, { status: 204 }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    const result = await client.request("DELETE", "orders/1");

    expect(result).toBeUndefined();
  });

  it("throws a mapped error for a non-2xx response", async () => {
    const { fetch } = createMockFetch(() =>
      jsonResponse(401, { message: "invalid token" }),
    );
    const client = new HttpClient({
      apiToken: "bad-token",
      fetchImpl: fetch,
    });

    await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
      Slant3dAuthenticationError,
    );
  });

  it("throws Slant3dNetworkError when fetch itself throws", async () => {
    const { fetch } = createMockFetch(() => {
      throw new Error("DNS failure");
    });
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
      Slant3dNetworkError,
    );
  });

  it("throws Slant3dTimeoutError when the request exceeds timeoutMs", async () => {
    const client = new HttpClient({
      apiToken: "abc123",
      timeoutMs: 10,
      maxRetries: 0,
      // Simulates a real fetch honoring AbortSignal: never settles on its
      // own, only rejects once the client's internal controller aborts it.
      fetchImpl: (async (_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }) as typeof fetch,
    });

    await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
      Slant3dTimeoutError,
    );
  });

  it("appends query params, repeating keys for arrays and skipping undefined", async () => {
    const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    await client.request("GET", "filaments", {
      query: { profile: ["PLA", "PETG"], page: 2, color: undefined },
    });

    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/filaments?profile=PLA&profile=PETG&page=2",
    );
  });

  it("normalizes a baseUrl without a trailing slash", async () => {
    const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      baseUrl: "https://example.test/v2/api",
    });

    await client.request("GET", "orders");

    expect(calls[0]?.url).toBe("https://example.test/v2/api/orders");
  });

  it("returns an ArrayBuffer when responseType is arrayBuffer", async () => {
    const { fetch } = createMockFetch(
      () => new Response(new Uint8Array([1, 2, 3])),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    const result = await client.request<ArrayBuffer>("POST", "files/openScad", {
      body: {},
      responseType: "arrayBuffer",
    });

    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
  });

  describe("retries", () => {
    it("retries GET on 503 and then succeeds", async () => {
      let attempts = 0;
      const { fetch, calls } = createMockFetch(() => {
        attempts += 1;
        return attempts < 3
          ? jsonResponse(503, { message: "unavailable" })
          : jsonResponse(200, { ok: true });
      });
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        retryBaseDelayMs: 0,
      });

      const result = await client.request("GET", "orders");

      expect(result).toEqual({ ok: true });
      expect(calls).toHaveLength(3);
    });

    it("gives up after maxRetries and throws the last error", async () => {
      const { fetch, calls } = createMockFetch(() =>
        jsonResponse(429, { message: "slow down" }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        maxRetries: 1,
        retryBaseDelayMs: 0,
      });

      await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
        Slant3dRateLimitError,
      );
      expect(calls).toHaveLength(2);
    });

    it("does not retry non-GET requests", async () => {
      const { fetch, calls } = createMockFetch(() =>
        jsonResponse(503, { message: "unavailable" }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        retryBaseDelayMs: 0,
      });

      await expect(client.request("POST", "orders/SLANT_1")).rejects.toThrow();
      expect(calls).toHaveLength(1);
    });

    it("does not retry client errors", async () => {
      const { fetch, calls } = createMockFetch(() =>
        jsonResponse(400, { message: "bad" }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        retryBaseDelayMs: 0,
      });

      await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
        Slant3dValidationError,
      );
      expect(calls).toHaveLength(1);
    });
  });
});
