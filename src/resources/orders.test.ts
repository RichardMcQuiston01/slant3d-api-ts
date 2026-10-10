import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { OrdersResource, type CreateOrderRequest } from "./orders.js";

const ENVELOPE = { success: true, message: "ok" };

function setup(body: unknown = { ...ENVELOPE, data: {} }) {
  const { fetch, calls } = createMockFetch(() => jsonResponse(200, body));
  const orders = new OrdersResource(
    new HttpClient({ apiToken: "abc123", fetchImpl: fetch }),
  );
  return { orders, calls };
}

describe("OrdersResource", () => {
  const request: CreateOrderRequest = {
    platformId: "11111111-1111-1111-1111-111111111111",
    customer: {
      details: {
        email: "a@example.com",
        address: {
          name: "Ada",
          line1: "1 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
        },
      },
    },
    items: [{ type: "PRINT", publicFileServiceId: "f1", quantity: 2 }],
  };

  it("creates a draft with POST orders", async () => {
    const { orders, calls } = setup();
    await orders.createDraft(request);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/orders");
    expect(calls[0]?.body).toEqual(request);
  });

  it("processes a draft with POST orders/{id} and no body", async () => {
    const { orders, calls } = setup();
    await orders.process("SLANT_0123456789");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/orders/SLANT_0123456789",
    );
    expect(calls[0]?.body).toBeUndefined();
  });

  it("cancels with DELETE orders/{id}", async () => {
    const { orders, calls } = setup();
    await orders.cancel("SLANT_1");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/orders/SLANT_1");
  });

  it("lists with filters and pagination as query params", async () => {
    const { orders, calls } = setup();
    await orders.list({ status: "SHIPPED", page: 2, limit: 10 });
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/orders?status=SHIPPED&page=2&limit=10",
    );
  });

  it("batch-gets with the snake_case public_ids body key", async () => {
    const { orders, calls } = setup();
    await orders.getMany(["SLANT_1", "SLANT_2"]);
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/orders/batch");
    expect(calls[0]?.body).toEqual({ public_ids: ["SLANT_1", "SLANT_2"] });
  });

  it("searches with the query param", async () => {
    const { orders, calls } = setup();
    await orders.search("ada");
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/orders/search?query=ada",
    );
  });
});
