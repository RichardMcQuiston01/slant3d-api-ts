import {
  mapHttpError,
  Slant3dConfigError,
  Slant3dApiError,
  Slant3dNetworkError,
  Slant3dRateLimitError,
  Slant3dResponseTooLargeError,
  Slant3dTimeoutError,
} from "../errors.js";

/** Base URL of the Slant3D V2 API. The trailing slash is significant. */
export const DEFAULT_BASE_URL = "https://slant3dapi.com/v2/api/";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
/**
 * Longest `Retry-After` wait honored between `GET` retries. Longer hints are
 * clamped to this, which also keeps the delay inside the platform timer
 * limit (2^31 - 1 ms).
 */
export const MAX_RETRY_DELAY_MS = 60_000;
/** Bytes of an external (e.g. storage) error body kept for diagnostics. */
const EXTERNAL_BODY_PREVIEW_BYTES = 1024;
/** Characters of a non-JSON success body kept on the thrown error. */
const NON_JSON_BODY_PREVIEW_CHARS = 200;
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
  /**
   * Maximum response body size in bytes. A larger body (by `Content-Length`
   * or while streaming) throws {@link Slant3dResponseTooLargeError}. Unlimited by
   * default.
   */
  maxResponseBytes?: number;
  /**
   * Allow `http:` presigned upload URLs. For tests against a local server
   * only; production uploads must use `https:`.
   */
  allowInsecureUploadUrl?: boolean;
}

/** Result of {@link HttpClient.fetchExternal}. */
export interface ExternalResponse {
  status: number;
  ok: boolean;
  /** At most the first 1 KiB of the body, for error messages. */
  bodyPreview: string;
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  /** Defaults to `"json"`. Use `"arrayBuffer"` for binary responses (STL). */
  responseType?: "json" | "arrayBuffer";
  /**
   * Resolve `path` against the API origin instead of the `/v2/api/` base,
   * for operations whose spec entry overrides `servers` (`/slant/webhook`).
   */
  outsideApiPrefix?: boolean;
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
  private readonly maxResponseBytes: number | undefined;
  readonly allowInsecureUploadUrl: boolean;

  constructor(options: HttpClientOptions) {
    this.apiToken = options.apiToken;
    const baseUrl: string = options.baseUrl ?? DEFAULT_BASE_URL;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.maxResponseBytes = options.maxResponseBytes;
    this.allowInsecureUploadUrl = options.allowInsecureUploadUrl ?? false;
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
      return Math.min(error.retryAfterMs, MAX_RETRY_DELAY_MS);
    }
    return this.retryBaseDelayMs * 2 ** (attempt - 1);
  }

  private async requestOnce<TResponse>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<TResponse> {
    const url: string = this.buildUrl(path, options.query, options.outsideApiPrefix);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    // The deadline covers the headers and the body read: `fetch` resolves as
    // soon as headers arrive, so the timer must outlive it.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const description = `Slant3D API request ${method} ${path}`;

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: controller.signal,
        });
      } catch (cause) {
        throw this.mapTransportError(cause, controller.signal, description);
      }

      let bytes: Uint8Array;
      try {
        bytes = await readBounded(
          response,
          controller.signal,
          this.maxResponseBytes,
          description,
        );
      } catch (cause) {
        throw this.mapTransportError(cause, controller.signal, description);
      }

      if (!response.ok) {
        throw mapHttpError(
          response.status,
          parseErrorBody(bytes),
          path,
          response.headers,
        );
      }
      if (options.responseType === "arrayBuffer") {
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as TResponse;
      }
      return parseSuccessBody(bytes, response.status, path) as TResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sends a request to a URL outside the API (e.g. a presigned storage URL)
   * with the client's timeout and fetch implementation, and without the API
   * bearer token. Only a short preview of the response body is read.
   */
  async fetchExternal(
    url: string,
    init: RequestInit,
    description: string,
  ): Promise<ExternalResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
        });
      } catch (cause) {
        throw this.mapTransportError(cause, controller.signal, description);
      }
      let preview: Uint8Array = new Uint8Array();
      if (!response.ok) {
        try {
          preview = await readBounded(
            response,
            controller.signal,
            EXTERNAL_BODY_PREVIEW_BYTES,
            description,
            true,
          );
        } catch (cause) {
          if (controller.signal.aborted) {
            throw this.mapTransportError(cause, controller.signal, description);
          }
        }
      } else {
        void response.body?.cancel().catch(() => undefined);
      }
      return {
        status: response.status,
        ok: response.ok,
        bodyPreview: new TextDecoder().decode(preview),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapTransportError(
    cause: unknown,
    signal: AbortSignal,
    description: string,
  ): Error {
    if (cause instanceof Slant3dResponseTooLargeError) {
      return cause;
    }
    if (signal.aborted) {
      return new Slant3dTimeoutError(
        `${description} timed out after ${this.timeoutMs}ms`,
      );
    }
    return new Slant3dNetworkError(
      `${description} failed before a complete response was received`,
      cause,
    );
  }

  private buildUrl(
    path: string,
    query?: QueryParams,
    outsideApiPrefix: boolean = false,
  ): string {
    const segments: string[] = path.replace(/^\/+/, "").split("/");
    for (const segment of segments) {
      if (isDotSegment(segment)) {
        throw new Slant3dConfigError(
          `Refusing to build a request URL for path "${path}": a "." or ".." segment would change which endpoint is called. Check the id passed to the client method.`,
        );
      }
    }
    const base: string = outsideApiPrefix
      ? this.baseUrl.replace(/api\/$/, "")
      : this.baseUrl;
    const url = new URL(segments.join("/"), base);
    const expectedPath: string = new URL(base).pathname + segments.join("/");
    if (url.pathname !== expectedPath) {
      throw new Slant3dConfigError(
        `Request path "${path}" resolved to "${url.pathname}" instead of "${expectedPath}". Check the ids passed to the client method.`,
      );
    }
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

/** True for `.`, `..`, and their percent-encoded forms, which URLs collapse. */
function isDotSegment(segment: string): boolean {
  return /^(\.|%2e){1,2}$/i.test(segment);
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

/**
 * Reads the response body, racing every read against the abort signal (a
 * hand-built or proxied body is not always tied to it) and enforcing an
 * optional size limit. With `truncate`, stops at the limit instead of
 * throwing.
 */
async function readBounded(
  response: Response,
  signal: AbortSignal,
  maxBytes: number | undefined,
  description: string,
  truncate: boolean = false,
): Promise<Uint8Array> {
  const tooLarge = (): Slant3dResponseTooLargeError =>
    new Slant3dResponseTooLargeError(
      `${description} returned a response body larger than the ${maxBytes}-byte limit (maxResponseBytes)`,
    );
  const declared: number = Number(response.headers.get("content-length"));
  if (
    !truncate &&
    maxBytes !== undefined &&
    Number.isFinite(declared) &&
    declared > maxBytes
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (response.body === null) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await raceAbort(reader.read(), signal);
      if (done) {
        break;
      }
      let chunk: Uint8Array = value;
      if (maxBytes !== undefined && total + chunk.byteLength > maxBytes) {
        if (!truncate) {
          throw tooLarge();
        }
        chunk = chunk.subarray(0, maxBytes - total);
      }
      chunks.push(chunk);
      total += chunk.byteLength;
      if (maxBytes !== undefined && total >= maxBytes && truncate) {
        break;
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  void reader.cancel().catch(() => undefined);

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = (): void => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value: T) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Error bodies may be plain text (proxy pages), so fall back to the text. */
function parseErrorBody(bytes: Uint8Array): unknown {
  const text: string = new TextDecoder().decode(bytes);
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A 2xx body must be empty (e.g. 204) or JSON; anything else is an error. */
function parseSuccessBody(
  bytes: Uint8Array,
  status: number,
  path: string,
): unknown {
  const text: string = new TextDecoder().decode(bytes);
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Slant3dApiError(
      `Slant3D API request to ${path} returned HTTP ${status} with a body that is not valid JSON (a proxy or gateway page?)`,
      status,
      path,
      text.slice(0, NON_JSON_BODY_PREVIEW_CHARS),
    );
  }
}
