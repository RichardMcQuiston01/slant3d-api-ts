import { mapHttpError, Slant3dNetworkError, Slant3dTimeoutError } from "../errors.js";

const DEFAULT_BASE_URL = "https://www.slant3dapi.com/api/";
const DEFAULT_TIMEOUT_MS = 30_000;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface HttpClientOptions {
  /** Slant3D team API token, sent as `Authorization: Token <apiToken>`. */
  apiToken: string;
  /** Override the API base URL. Defaults to the production Slant3D API. */
  baseUrl?: string;
  /** Inject a custom `fetch` implementation (mainly for tests). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * Minimal internal HTTP client wrapping `fetch` with Slant3D's auth header,
 * JSON (de)serialization, timeout handling, and error mapping. Not part of
 * the public API surface — resource classes depend on this, consumers do
 * not construct it directly.
 */
export class HttpClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<TResponse>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const url = new URL(path, this.baseUrl).toString();
    const headers: Record<string, string> = {
      Authorization: `Token ${this.apiToken}`,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new Slant3dTimeoutError(
          `Slant3D API request to ${path} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new Slant3dNetworkError(
        `Slant3D API request to ${path} failed`,
        cause,
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseBody = await parseBody(response);

    if (!response.ok) {
      throw mapHttpError(response.status, responseBody, path, response.headers);
    }

    return responseBody as TResponse;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
