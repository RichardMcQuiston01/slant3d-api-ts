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
  if (
    body !== null &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return undefined;
}

function parseRetryAfterMs(headers?: Headers): number | undefined {
  const retryAfter = headers?.get("retry-after");
  if (!retryAfter) {
    return undefined;
  }
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}
