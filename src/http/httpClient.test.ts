import { describe, expect, it } from "bun:test";
import { Slant3dAuthenticationError, Slant3dNetworkError, Slant3dTimeoutError } from "../errors.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { HttpClient } from "./httpClient.js";

describe("HttpClient", () => {
  it("joins the base URL and path, and sets the auth header", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { ok: true }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    await client.request("GET", "quotes");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://www.slant3dapi.com/api/quotes");
    expect(calls[0]?.headers.get("authorization")).toBe("Token abc123");
  });

  it("serializes a JSON body and sets Content-Type when a body is given", async () => {
    const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    await client.request("POST", "quotes", {
      fileURL: "https://example.com/a.stl",
    });

    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.body).toEqual({ fileURL: "https://example.com/a.stl" });
  });

  it("parses a JSON response body", async () => {
    const { fetch } = createMockFetch(() =>
      jsonResponse(200, { data: { price: 5.2 } }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    const result = await client.request<{ data: { price: number } }>(
      "GET",
      "quotes",
    );

    expect(result).toEqual({ data: { price: 5.2 } });
  });

  it("falls back to raw text when the response body is not JSON", async () => {
    const { fetch } = createMockFetch(
      () => new Response("not json", { status: 200 }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    const result = await client.request("GET", "quotes");

    expect(result).toBe("not json");
  });

  it("returns undefined for an empty response body", async () => {
    const { fetch } = createMockFetch(
      () => new Response(null, { status: 204 }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    const result = await client.request("DELETE", "orders/1");

    expect(result).toBeUndefined();
  });

  it("throws a mapped error for a non-2xx response", async () => {
    const { fetch } = createMockFetch(() =>
      jsonResponse(401, { message: "invalid token" }),
    );
    const client = new HttpClient({ apiToken: "bad-token", fetchImpl: fetch });

    await expect(client.request("GET", "quotes")).rejects.toBeInstanceOf(
      Slant3dAuthenticationError,
    );
  });

  it("throws Slant3dNetworkError when fetch itself throws", async () => {
    const { fetch } = createMockFetch(() => {
      throw new Error("DNS failure");
    });
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });

    await expect(client.request("GET", "quotes")).rejects.toBeInstanceOf(
      Slant3dNetworkError,
    );
  });

  it("throws Slant3dTimeoutError when the request exceeds timeoutMs", async () => {
    const client = new HttpClient({
      apiToken: "abc123",
      timeoutMs: 10,
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

    await expect(client.request("GET", "quotes")).rejects.toBeInstanceOf(
      Slant3dTimeoutError,
    );
  });
});
