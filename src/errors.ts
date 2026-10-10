/** Base class for all errors thrown by this client. */
export class Slant3dError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when the client is misconfigured, e.g. no API token resolved. */
export class Slant3dConfigError extends Slant3dError {}

/**
 * Thrown when a request never reaches the Slant3D API (DNS/connection
 * failure, or the underlying `fetch` call throwing for any other reason).
 */
export class Slant3dNetworkError extends Slant3dError {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/**
 * Thrown when a response body exceeds the configured `maxResponseBytes`.
 * Not retried: the same response would exceed the limit again.
 */
export class Slant3dResponseTooLargeError extends Slant3dError {}

/** Thrown when a request is aborted after exceeding its configured timeout. */
export class Slant3dTimeoutError extends Slant3dError {}

/** Thrown for any non-2xx HTTP response from the Slant3D API. */
export class Slant3dApiError extends Slant3dError {
  readonly status: number;
  readonly requestPath: string;
  readonly responseBody: unknown;

  constructor(
    message: string,
    status: number,
    requestPath: string,
    responseBody: unknown,
  ) {
    super(message);
    this.status = status;
    this.requestPath = requestPath;
    this.responseBody = responseBody;
  }
}

/** 401 responses. */
export class Slant3dAuthenticationError extends Slant3dApiError {}

/** 403 responses. */
export class Slant3dAuthorizationError extends Slant3dApiError {}

/** 404 responses. */
export class Slant3dNotFoundError extends Slant3dApiError {}

/** 400/422 responses. */
export class Slant3dValidationError extends Slant3dApiError {}

/** 429 responses, with the `Retry-After` header parsed when present. */
export class Slant3dRateLimitError extends Slant3dApiError {
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    status: number,
    requestPath: string,
    responseBody: unknown,
    retryAfterMs?: number,
  ) {
    super(message, status, requestPath, responseBody);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Maps an HTTP response status to the most specific {@link Slant3dApiError}
 * subclass available, per this client's convention of preferring specific
 * error types over one generic error (see api-conventions).
 */
export function mapHttpError(
  status: number,
  responseBody: unknown,
  requestPath: string,
  headers?: Headers,
): Slant3dApiError {
  const message =
    extractMessage(responseBody) ??
    `Slant3D API request failed with status ${status}`;

  switch (status) {
    case 401:
      return new Slant3dAuthenticationError(
        message,
        status,
        requestPath,
        responseBody,
      );
    case 403:
      return new Slant3dAuthorizationError(
        message,
        status,
        requestPath,
        responseBody,
      );
    case 404:
      return new Slant3dNotFoundError(
        message,
        status,
        requestPath,
        responseBody,
      );
    case 400:
    case 422:
      return new Slant3dValidationError(
        message,
        status,
        requestPath,
        responseBody,
      );
    case 429:
      return new Slant3dRateLimitError(
        message,
        status,
        requestPath,
        responseBody,
        parseRetryAfterMs(headers),
      );
    default:
      return new Slant3dApiError(message, status, requestPath, responseBody);
  }
}

function extractMessage(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") {
    return undefined;
  }
  const { message, error } = body as { message?: unknown; error?: unknown };
  // V2 shape: { success, message, error?: string }
  if (typeof message === "string" && typeof error === "string") {
    return `${message}: ${error}`;
  }
  if (typeof message === "string") {
    return message;
  }
  // Some endpoints (e.g. GET /filaments) nest it: { error: { message } }
  if (error !== null && typeof error === "object") {
    const nested: unknown = (error as { message?: unknown }).message;
    if (typeof nested === "string") {
      return nested;
    }
  }
  return typeof error === "string" ? error : undefined;
}

/**
 * Parses a `Retry-After` header (RFC 9110): either delta-seconds or an
 * HTTP-date. Returns the requested wait in milliseconds, or `undefined` when
 * the header is absent, negative, non-finite, or unparseable, so callers fall
 * back to their own backoff. A date in the past yields `0`.
 */
export function parseRetryAfterMs(
  headers?: Headers,
  now: number = Date.now(),
): number | undefined {
  const retryAfter: string | undefined = headers?.get("retry-after")?.trim();
  if (!retryAfter) {
    return undefined;
  }
  if (/^\d+$/.test(retryAfter)) {
    const ms: number = Number(retryAfter) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  // HTTP-dates start with a day name; this keeps Date.parse from reading
  // "-5" or other stray numerics as years.
  const dateMs: number = /^[A-Za-z]/.test(retryAfter)
    ? Date.parse(retryAfter)
    : Number.NaN;
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - now);
}

/** Thrown when a webhook signature, timestamp, or payload fails verification. */
export class Slant3dWebhookError extends Slant3dError {
  override readonly cause?: unknown;

  /**
   * @param message Fixed, caller-safe text; never interpolate request data.
   * @param cause Underlying error for server-side logs only.
   */
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
