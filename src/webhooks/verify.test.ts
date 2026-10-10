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

  it("rejects a timestamp too far in the future", async () => {
    const future = String(NOW + 5 * 60 * 1000 + 1);
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp: future,
      signature: sign(PAYLOAD, future),
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("tolerance");
  });

  it("accepts a timestamp exactly at the future tolerance", async () => {
    const edge = String(NOW + 5 * 60 * 1000);
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp: edge,
      signature: sign(PAYLOAD, edge),
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects signatures of the wrong length or with bad hex", async () => {
    for (const signature of ["sha256=00", "sha256=" + "zz".repeat(32), "sha256=" + "00".repeat(40)]) {
      const result = await verifyWebhookSignature({
        payload: PAYLOAD,
        timestamp,
        signature,
        secret: SECRET,
        now: NOW,
      });
      expect(result.valid).toBe(false);
    }
  });

  it("accepts the current or the previous secret during a rotation", async () => {
    const OLD = "o".repeat(40);
    const NEW = "n".repeat(40);
    for (const signingSecret of [OLD, NEW]) {
      const result = await verifyWebhookSignature({
        payload: PAYLOAD,
        timestamp,
        signature: sign(PAYLOAD, timestamp, signingSecret),
        secret: [OLD, NEW],
        now: NOW,
      });
      expect(result).toEqual({ valid: true });
    }
  });

  it("accepts when only the second of two secrets matches", async () => {
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature: sign(PAYLOAD, timestamp, "second".padEnd(40, "!")),
      secret: ["first".padEnd(40, "!"), "second".padEnd(40, "!")],
      now: NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects when none of several secrets match, or the list is empty", async () => {
    const signature = sign(PAYLOAD, timestamp, "x".repeat(40));
    const noMatch = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature,
      secret: ["a".repeat(40), "b".repeat(40)],
      now: NOW,
    });
    const empty = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp,
      signature,
      secret: [],
      now: NOW,
    });
    expect(noMatch.valid).toBe(false);
    expect(empty.valid).toBe(false);
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

  it("does not echo the timestamp header in the reason", async () => {
    const hostile = "abc\nInjected: line";
    const result = await verifyWebhookSignature({
      payload: PAYLOAD,
      timestamp: hostile,
      signature: "sha256=00",
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).not.toContain("Injected");
      expect(result.reason).not.toContain("abc");
    }
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

  it("keeps the dummy flag on test webhooks", async () => {
    const payload = JSON.stringify({ ...JSON.parse(PAYLOAD), dummy: true });
    const event = await constructWebhookEvent({
      payload,
      headers: {
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature-256": sign(payload, timestamp),
      },
      secret: SECRET,
      now: NOW,
    });
    expect(event.dummy).toBe(true);
  });

  it("does not put the timestamp or parser output in the thrown message", async () => {
    const hostile = "evil\nvalue";
    const error = (await constructWebhookEvent({
      payload: PAYLOAD,
      headers: {
        "X-Webhook-Timestamp": hostile,
        "X-Webhook-Signature-256": "sha256=00",
      },
      secret: SECRET,
      now: NOW,
    }).catch((e: unknown) => e)) as Slant3dWebhookError;
    expect(error.message).not.toContain("evil");

    const badJson = "{not json";
    const jsonError = (await constructWebhookEvent({
      payload: badJson,
      headers: {
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature-256": sign(badJson, timestamp),
      },
      secret: SECRET,
      now: NOW,
    }).catch((e: unknown) => e)) as Slant3dWebhookError;
    expect(jsonError).toBeInstanceOf(Slant3dWebhookError);
    expect(jsonError.message).not.toContain("not json");
    expect(jsonError.cause).toBeInstanceOf(SyntaxError);
  });

  it("accepts an array of secrets", async () => {
    const event = await constructWebhookEvent({
      payload: PAYLOAD,
      headers: {
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature-256": sign(PAYLOAD, timestamp),
      },
      secret: ["z".repeat(40), SECRET],
      now: NOW,
    });
    expect(event.platform_id).toBe("p1");
  });
});
