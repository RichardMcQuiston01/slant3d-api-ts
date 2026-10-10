import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { PlatformsResource } from "./platforms.js";

function setup() {
  const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
  const platforms = new PlatformsResource(
    new HttpClient({ apiToken: "abc123", fetchImpl: fetch }),
  );
  return { platforms, calls };
}

const BASE = "https://slant3dapi.com/v2/api";

describe("PlatformsResource", () => {
  it("maps each method to its documented method and path", async () => {
    const { platforms, calls } = setup();
    await platforms.list();
    await platforms.create({ name: "Shop", url: "https://shop.example.test" });
    await platforms.get("p1");
    await platforms.update("p1", { webhookURL: "https://shop.example.test/hook" });
    await platforms.disable("p1");
    await platforms.enable("p1");
    await platforms.refreshWebhookSecret("p1");
    await platforms.sendTestWebhook("p1");
    await platforms.listDeadWebhooks("p1");
    await platforms.resendDeadWebhooks("p1");
    await platforms.resendDeadWebhook("p1", "w1");
    await platforms.getStripePublicKey();

    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, "")}`)).toEqual([
      "GET /platforms",
      "POST /platforms",
      "GET /platforms/p1",
      "PATCH /platforms/p1",
      "DELETE /platforms/p1",
      "PATCH /platforms/p1/enable",
      "PATCH /platforms/p1/webhook-secret",
      "POST /platforms/p1/webhook/dummy",
      "GET /platforms/p1/webhook",
      "POST /platforms/p1/webhook/resend",
      "POST /platforms/p1/webhook/w1/resend",
      "GET /platforms/stripe/public-key",
    ]);
  });

  it("sends custom webhooks to POST slant/webhook", async () => {
    const { platforms, calls } = setup();
    await platforms.sendCustomWebhook({
      event_type: "order.shipped",
      service: "order-service",
      platform_id: "p1",
      data: { order: { public_id: "SLANT_1", status: "SHIPPED" } },
    });
    // Served from /v2, outside the /api prefix (operation-level `servers`).
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/slant/webhook");
    expect(calls[0]?.method).toBe("POST");
  });
});
