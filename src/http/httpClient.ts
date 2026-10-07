import {
  mapHttpError,
  Slant3dApiError,
  Slant3dNetworkError,
  Slant3dRateLimitError,
  Slant3dTimeoutError,
} from "../errors.js";

/** Base URL of the Slant3D V2 API. The trailing slash is significant. */
export const DEFAULT_BASE_URL = "https://slant3dapi.com/v2/api/";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504]);

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A single query-string value. Arrays are sent as repeated keys. */
export type QueryValue =
  | string
  | number
  | boolean
  | undefined
  | readonly (string | number | boolean)[];

export type QueryParams = Readonly<Record<string, QueryValue>>;

export interface HttpClientOptions {
  /** Slant3D API key, sent as `Authorization: Bearer <apiToken>`. */
  apiToken: string;
  /** Override the API base URL. Defaults to the production V2 API. */
  baseUrl?: string;
  /** Inject a custom `fetch` implementation (mainly for tests). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /**
   * Maximum automatic retries for `GET` requests that fail with a network
   * error, timeout, 429, or 5xx. Non-`GET` requests are never retried
   * because order processing and creation are not idempotent. Defaults to 2.
   */
  maxRetries?: number;
  /** Base delay for exponential backoff between retries. Defaults to 500. */
  retryBaseDelayMs?: number;
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  /** Defaults to `"json"`. Use `"arrayBuffer"` for binary responses (STL). */
  responseType?: "json" | "arrayBuffer";
}

/**
 * Minimal internal HTTP client wrapping `fetch` with Slant3D's auth header,
 * JSON (de)serialization, timeout handling, safe `GET` retries, and error
 * mapping. Resource classes depend on this; consumers do not construct it.
 */
export class HttpClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: HttpClientOptions) {
    this.apiToken = options.apiToken;
    const baseUrl: string = options.baseUrl ?? DEFAULT_BASE_URL;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  }

  async request<TResponse>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<TResponse> {
    const maxAttempts: number = method === "GET" ? this.maxRetries + 1 : 1;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.requestOnce<TResponse>(method, path, options);
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryable(error)) {
          throw error;
        }
        await sleep(this.retryDelayMs(attempt, error));
      }
    }
  }

  private retryDelayMs(attempt: number, error: unknown): number {
    if (
      error instanceof Slant3dRateLimitError &&
      error.retryAfterMs !== undefined
    ) {
      return error.retryAfterMs;
    }
    return this.retryBaseDelayMs * 2 ** (attempt - 1);
  }

  private async requestOnce<TResponse>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<TResponse> {
    const url: string = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new Slant3dTimeoutError(
          `Slant3D API request ${method} ${path} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new Slant3dNetworkError(
        `Slant3D API request ${method} ${path} failed before a response was received`,
        cause,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody: unknown = await parseBody(response);
      throw mapHttpError(response.status, errorBody, path, response.headers);
    }

    if (options.responseType === "arrayBuffer") {
      return (await response.arrayBuffer()) as TResponse;
    }
    return (await parseBody(response)) as TResponse;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(path.replace(/^\/+/, ""), this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) {
        continue;
      }
      const values: readonly (string | number | boolean)[] = Array.isArray(
        value,
      )
        ? (value as readonly (string | number | boolean)[])
        : [value as string | number | boolean];
      for (const item of values) {
        url.searchParams.append(key, String(item));
      }
    }
    return url.toString();
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Slant3dNetworkError) return true;
  if (error instanceof Slant3dTimeoutError) return true;
  if (error instanceof Slant3dRateLimitError) return true;
  return error instanceof Slant3dApiError && RETRYABLE_STATUSES.has(error.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(response: Response): Promise<unknown> {
  const text: string = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
