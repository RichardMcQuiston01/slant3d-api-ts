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
  /** The platform's `webhookSecret`. */
  secret: string;
  /** Maximum accepted age in ms. Defaults to 5 minutes. */
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
 * rejected when older than the tolerance. Uses Web Crypto, so it runs on
 * Node 18+, Bun, Deno, and edge runtimes.
 */
export async function verifyWebhookSignature(
  options: VerifyWebhookOptions,
): Promise<WebhookVerificationResult> {
  const { payload, timestamp, signature, secret } = options;
  if (!secret) {
    return { valid: false, reason: "Webhook secret is empty" };
  }
  if (!signature) {
    return { valid: false, reason: `Missing ${WEBHOOK_SIGNATURE_HEADER} header` };
  }
  const timestampMs = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampMs)) {
    return {
      valid: false,
      reason: `Missing or non-numeric ${WEBHOOK_TIMESTAMP_HEADER} header: "${timestamp}"`,
    };
  }

  const expectedHex: string = signature.replace(/^sha256=/, "").toLowerCase();
  const computedHex: string = await hmacSha256Hex(
    secret,
    `${timestamp}.${payload}`,
  );
  if (!constantTimeEqual(expectedHex, computedHex)) {
    return { valid: false, reason: "Signature does not match payload" };
  }

  const now: number = options.now ?? Date.now();
  const toleranceMs: number =
    options.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;
  const ageMs: number = now - timestampMs;
  if (ageMs > toleranceMs) {
    return {
      valid: false,
      reason: `Webhook is ${ageMs}ms old, which exceeds the ${toleranceMs}ms tolerance`,
    };
  }
  return { valid: true };
}

export interface ConstructWebhookEventOptions {
  /** The raw request body, exactly as received. */
  payload: string;
  /** Request headers; lookups are case-insensitive. */
  headers: Headers | Readonly<Record<string, string | string[] | undefined>>;
  secret: string;
  toleranceMs?: number;
  now?: number;
}

/**
 * Verifies the signature headers on a webhook request and returns the parsed
 * event. Throws {@link Slant3dWebhookError} with a descriptive reason when
 * verification or parsing fails.
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
      `Webhook signature was valid but the body is not valid JSON: ${String(cause)}`,
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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
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
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
