import { describe, expect, it } from "bun:test";
import {
  Slant3dApiError,
  Slant3dAuthenticationError,
  Slant3dConfigError,
  Slant3dNetworkError,
  Slant3dRateLimitError,
  Slant3dResponseTooLargeError,
  Slant3dTimeoutError,
  Slant3dValidationError,
} from "../errors.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { HttpClient, MAX_RETRY_DELAY_MS } from "./httpClient.js";

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

  it("rejects a 2xx body that is not JSON, keeping a truncated copy", async () => {
    const { fetch } = createMockFetch(
      () => new Response(`<html>${"x".repeat(1000)}</html>`, { status: 200 }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      retryBaseDelayMs: 0,
    });

    const error = (await client
      .request("GET", "orders")
      .catch((e: unknown) => e)) as Slant3dApiError;

    expect(error).toBeInstanceOf(Slant3dApiError);
    expect(error.status).toBe(200);
    expect(String(error.responseBody)).toHaveLength(200);
    expect(String(error.responseBody).startsWith("<html>")).toBe(true);
  });

  it("still returns raw text for non-JSON error bodies", async () => {
    const { fetch } = createMockFetch(
      () => new Response("bad gateway", { status: 502 }),
    );
    const client = new HttpClient({
      apiToken: "abc123",
      fetchImpl: fetch,
      maxRetries: 0,
    });
    const error = (await client
      .request("GET", "orders")
      .catch((e: unknown) => e)) as Slant3dApiError;
    expect(error.responseBody).toBe("bad gateway");
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

  describe("path safety", () => {
    it.each(["..", ".", "%2e%2E", "a/../b"])(
      "rejects path %p without a request",
      async (id: string) => {
        const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
        const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
        await expect(
          client.request("GET", `files/owner/${id}`),
        ).rejects.toBeInstanceOf(Slant3dConfigError);
        expect(calls).toHaveLength(0);
      },
    );

    it("keeps dots inside a segment", async () => {
      const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
      const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
      await client.request("GET", "files/a..b");
      expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/files/a..b");
    });
  });

  describe("outsideApiPrefix", () => {
    it("drops the /api segment of the default base URL", async () => {
      const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
      const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
      await client.request("POST", "slant/webhook", { outsideApiPrefix: true });
      expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/slant/webhook");
    });

    it("derives the origin from a custom base URL", async () => {
      const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        baseUrl: "http://localhost:8080/v2/api",
      });
      await client.request("POST", "slant/webhook", { outsideApiPrefix: true });
      expect(calls[0]?.url).toBe("http://localhost:8080/v2/slant/webhook");
    });
  });

  describe("body deadline and size limit", () => {
    /** A response whose headers arrive but whose body never does. */
    const stalledBody = (): Response =>
      new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
        status: 200,
      });

    it("times out when the body stalls after the headers", async () => {
      const { fetch } = createMockFetch(stalledBody);
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        timeoutMs: 20,
        maxRetries: 0,
      });
      await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
        Slant3dTimeoutError,
      );
      await expect(
        client.request("POST", "files/openScad", {
          responseType: "arrayBuffer",
        }),
      ).rejects.toBeInstanceOf(Slant3dTimeoutError);
    });

    it("rejects a body larger than maxResponseBytes while streaming", async () => {
      const { fetch } = createMockFetch(
        () => new Response("x".repeat(100), { status: 200 }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        maxResponseBytes: 50,
      });
      await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
        Slant3dResponseTooLargeError,
      );
    });

    it("rejects early on a Content-Length above the limit, without retrying", async () => {
      const { fetch, calls } = createMockFetch(
        () =>
          new Response("{}", {
            status: 200,
            headers: { "Content-Length": "1000" },
          }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        maxResponseBytes: 50,
        retryBaseDelayMs: 0,
      });
      await expect(client.request("GET", "orders")).rejects.toBeInstanceOf(
        Slant3dResponseTooLargeError,
      );
      expect(calls).toHaveLength(1);
    });

    it("accepts a body at the limit", async () => {
      const { fetch } = createMockFetch(
        () => new Response(JSON.stringify({ a: 1 }), { status: 200 }),
      );
      const client = new HttpClient({
        apiToken: "abc123",
        fetchImpl: fetch,
        maxResponseBytes: 7,
      });
      expect(await client.request<{ a: number }>("GET", "orders")).toEqual({
        a: 1,
      });
    });
  });

  describe("Retry-After handling", () => {
    async function waitedMs(retryAfter: string): Promise<number> {
      const waits: number[] = [];
      const realSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void, ms?: number) => {
        if (ms !== undefined && ms !== 20_000) waits.push(ms);
        return realSetTimeout(fn, 0);
      }) as typeof setTimeout;
      try {
        let attempts = 0;
        const { fetch } = createMockFetch(() =>
          attempts++ === 0
            ? new Response("{}", {
                status: 429,
                headers: { "Retry-After": retryAfter },
              })
            : jsonResponse(200, {}),
        );
        const client = new HttpClient({
          apiToken: "abc123",
          fetchImpl: fetch,
          retryBaseDelayMs: 7,
          timeoutMs: 20_000,
        });
        await client.request("GET", "orders");
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
      return waits[0] ?? -1;
    }

    it("honors delta-seconds", async () => {
      expect(await waitedMs("5")).toBe(5000);
    });

    it("honors an HTTP-date", async () => {
      const inTenSeconds: string = new Date(Date.now() + 10_000).toUTCString();
      const waited: number = await waitedMs(inTenSeconds);
      expect(waited).toBeGreaterThan(7_000);
      expect(waited).toBeLessThanOrEqual(10_000);
    });

    it("clamps a huge delay to the documented maximum", async () => {
      expect(await waitedMs("3000000")).toBe(MAX_RETRY_DELAY_MS);
    });

    it("falls back to backoff for a negative delay", async () => {
      expect(await waitedMs("-5")).toBe(7);
    });
  });
});
