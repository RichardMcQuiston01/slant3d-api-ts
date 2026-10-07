import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { Slant3dWebhookError } from "../errors.js";
import {
  constructWebhookEvent,
  verifyWebhookSignature,
} from "./verify.js";

const SECRET = "s".repeat(40);
const NOW = 1_761_933_541_285;
const PAYLOAD = JSON.stringify({
  event_type: "order.shipped",
  service: "order-service",
  platform_id: "p1",
  data: { order: { public_id: "SLANT_1", status: "SHIPPED" } },
});

function sign(payload: string, timestamp: string, secret: string = SECRET): string {
  const hex: string = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `sha256=${hex}`;
}

describe("verifyWebhookSignature", () => {
  const timestamp = String(NOW - 1000);

  it("accepts a correctly signed, fresh webhook", async () => {
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature: sign(PAYLOAD, timestamp),
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects a tampered payload", async () => {
    const result = await verifyWebhookSignature({
      payload: PAYLOAD.replace("SHIPPED", "DELIVERED"),
      timestamp,
      signature: sign(PAYLOAD, timestamp),
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature: sign(PAYLOAD, timestamp, "x".repeat(40)),
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a webhook older than the tolerance", async () => {
    const oldTimestamp = String(NOW - 6 * 60 * 1000);
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp: oldTimestamp,
      signature: sign(PAYLOAD, oldTimestamp),
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("tolerance");
  });

  it("reports a missing signature and a bad timestamp distinctly", async () => {
    const missing = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature: "",
      secret: SECRET,
      now: NOW,
    });
    const badTimestamp = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp: "abc",
      signature: "sha256=00",
      secret: SECRET,
      now: NOW,
    });
    expect(missing.valid === false && missing.reason).toContain("Missing");
    expect(badTimestamp.valid === false && badTimestamp.reason).toContain(
      "non-numeric",
    );
  });
});

describe("constructWebhookEvent", () => {
  const timestamp = String(NOW - 1000);

  it("verifies plain-object headers case-insensitively and parses the event", async () => {
    const event = await constructWebhookEvent({
      payload: PAYLOAD,
      headers: {
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature-256": sign(PAYLOAD, timestamp),
      },
      secret: SECRET,
      now: NOW,
    });
    expect(event.event_type).toBe("order.shipped");
  });

  it("accepts a Headers instance", async () => {
    const event = await constructWebhookEvent({
      payload: PAYLOAD,
      headers: new Headers({
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature-256": sign(PAYLOAD, timestamp),
      }),
      secret: SECRET,
      now: NOW,
    });
    expect(event.platform_id).toBe("p1");
  });

  it("throws Slant3dWebhookError with the reason on a bad signature", async () => {
    await expect(
      constructWebhookEvent({
        payload: PAYLOAD,
        headers: {
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Signature-256": "sha256=deadbeef",
        },
        secret: SECRET,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(Slant3dWebhookError);
  });
});
