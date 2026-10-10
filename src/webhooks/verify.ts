import { Slant3dWebhookError } from "../errors.js";
import type { WebhookEvent } from "./types.js";

/** Header carrying the `sha256=<hex>` signature. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Webhook-Signature-256";
/** Header carrying the Unix-milliseconds timestamp that was signed. */
export const WEBHOOK_TIMESTAMP_HEADER = "X-Webhook-Timestamp";
/** Default maximum age of a webhook before it is rejected (5 minutes). */
export const DEFAULT_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received (before any JSON parsing). */
  payload: string;
  /** Value of the `X-Webhook-Timestamp` header. */
  timestamp: string;
  /** Value of the `X-Webhook-Signature-256` header (`sha256=<hex>`). */
  signature: string;
  /**
   * The platform's `webhookSecret`. Pass several to accept any of them. A
   * rotation takes effect at once on the API side, so during a rollout pass
   * `[newSecret, previousSecret]`, then drop the old one once every instance
   * has the new value.
   */
  secret: string | readonly string[];
  /** Maximum accepted clock difference in ms, either direction. Defaults to 5 minutes. */
  toleranceMs?: number;
  /** Current time in Unix ms. Defaults to `Date.now()`. For tests. */
  now?: number;
}

export type WebhookVerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Verifies a Slant3D webhook: HMAC-SHA256 over `"<timestamp>.<rawBody>"`
 * keyed with the platform's webhook secret, compared in constant time, and
 * rejected when the timestamp is more than the tolerance away from the
 * receiver's clock (too old or too far in the future).
 *
 * Failure reasons are fixed strings that never include request data. Uses Web Crypto, so it runs on
 * Node 18+, Bun, Deno, and edge runtimes.
 */
export async function verifyWebhookSignature(
  options: VerifyWebhookOptions,
): Promise<WebhookVerificationResult> {
  const { payload, timestamp, signature } = options;
  const secrets: readonly string[] = (
    typeof options.secret === "string" ? [options.secret] : options.secret
  ).filter((candidate: string) => candidate.length > 0);
  if (secrets.length === 0) {
    return { valid: false, reason: "Webhook secret is empty" };
  }
  if (!signature) {
    return { valid: false, reason: `Missing ${WEBHOOK_SIGNATURE_HEADER} header` };
  }
  const timestampMs = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampMs)) {
    return {
      valid: false,
      reason: `Missing or non-numeric ${WEBHOOK_TIMESTAMP_HEADER} header`,
    };
  }

  const expected: Uint8Array | undefined = decodeSignature(signature);
  const message = `${timestamp}.${payload}`;
  // Every candidate is computed and compared, so a match on the first secret
  // does not return early.
  let matched = false;
  for (const secret of secrets) {
    const computed: Uint8Array = await hmacSha256(secret, message);
    const equal: boolean = constantTimeEqual(
      expected ?? new Uint8Array(computed.length),
      computed,
    );
    matched = matched || (equal && expected !== undefined);
  }
  if (!matched) {
    return { valid: false, reason: "Signature does not match payload" };
  }

  const now: number = options.now ?? Date.now();
  const toleranceMs: number =
    options.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;
  const skewMs: number = now - timestampMs;
  if (Math.abs(skewMs) > toleranceMs) {
    return {
      valid: false,
      reason: `Webhook timestamp is ${skewMs}ms from the receiver clock, outside the ${toleranceMs}ms tolerance`,
    };
  }
  return { valid: true };
}

export interface ConstructWebhookEventOptions {
  /** The raw request body, exactly as received. */
  payload: string;
  /** Request headers; lookups are case-insensitive. */
  headers: Headers | Readonly<Record<string, string | string[] | undefined>>;
  /** One secret, or several to accept during a rotation. See {@link VerifyWebhookOptions.secret}. */
  secret: string | readonly string[];
  toleranceMs?: number;
  now?: number;
}

/**
 * Verifies the signature headers on a webhook request and returns the parsed
 * event. Throws {@link Slant3dWebhookError} when verification or parsing
 * fails. The message is a fixed string safe to log; do not return it to the
 * sender. Parser details are on `error.cause`.
 *
 * Replay: a delivery is accepted again if it is resubmitted inside the
 * tolerance window, and legitimate retries look identical. Events carry no
 * id, so to ignore duplicates store a hash of the raw body (or of the
 * signature header) for at least the tolerance window and skip repeats.
 */
export async function constructWebhookEvent(
  options: ConstructWebhookEventOptions,
): Promise<WebhookEvent> {
  const result: WebhookVerificationResult = await verifyWebhookSignature({
    payload: options.payload,
    timestamp: readHeader(options.headers, WEBHOOK_TIMESTAMP_HEADER),
    signature: readHeader(options.headers, WEBHOOK_SIGNATURE_HEADER),
    secret: options.secret,
    toleranceMs: options.toleranceMs,
    now: options.now,
  });
  if (!result.valid) {
    throw new Slant3dWebhookError(
      `Webhook verification failed: ${result.reason}`,
    );
  }
  try {
    return JSON.parse(options.payload) as WebhookEvent;
  } catch (cause) {
    throw new Slant3dWebhookError(
      "Webhook signature was valid but the body is not valid JSON",
      cause,
    );
  }
}

function readHeader(
  headers: ConstructWebhookEventOptions["headers"],
  name: string,
): string {
  if (headers instanceof Headers) {
    return headers.get(name) ?? "";
  }
  const lowerName: string = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return (Array.isArray(value) ? value[0] : value) ?? "";
    }
  }
  return "";
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key: CryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest: ArrayBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return new Uint8Array(digest);
}

/** Decodes `sha256=<64 hex>`; `undefined` when malformed. */
function decodeSignature(signature: string): Uint8Array | undefined {
  const hex: string = signature.replace(/^sha256=/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return undefined;
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Compares two equal-length digests without an early exit. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
