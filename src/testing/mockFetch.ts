/** A single recorded call made through a {@link createMockFetch} instance. */
export interface MockFetchCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

export type MockFetchHandler = (
  call: MockFetchCall,
) => Response | Promise<Response>;

/**
 * Builds a `fetch`-compatible function for tests, backed by a caller-supplied
 * handler. Also exposes every call made so tests can assert on request shape
 * (method, path, body) without a real network call. Shared across every
 * resource module's tests so they use one consistent mocking convention.
 */
export function createMockFetch(handler: MockFetchHandler): {
  fetch: typeof fetch;
  calls: MockFetchCall[];
} {
  const calls: MockFetchCall[] = [];

  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const headers = new Headers(init?.headers);
    const rawBody = init?.body;
    const body =
      typeof rawBody === "string" && rawBody.length > 0
        ? JSON.parse(rawBody)
        : undefined;

    const call: MockFetchCall = {
      url: input.toString(),
      method: init?.method ?? "GET",
      headers,
      body,
    };
    calls.push(call);

    return handler(call);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

/** Convenience helper for building a JSON `Response` in tests. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
