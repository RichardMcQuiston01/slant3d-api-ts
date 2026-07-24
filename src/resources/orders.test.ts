import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { type CreateOrderRequest, OrdersResource } from "./orders.js";

const sampleRequest: CreateOrderRequest = {
  email: "customer@example.com",
  phone: "+1-555-123-4567",
  name: "Jane Customer",
  orderNumber: "ORD-1001",
  filename: "bracket.stl",
  fileURL: "https://example.com/bracket.stl",
  bill_to_street_1: "123 Main St",
  bill_to_street_2: "Suite 4",
  bill_to_city: "Springfield",
  bill_to_state: "IL",
  bill_to_zip: "62701",
  bill_to_country_as_iso: "US",
  bill_to_is_US_residential: true,
  ship_to_name: "Jane Customer",
  ship_to_street_1: "456 Oak Ave",
  ship_to_city: "Springfield",
  ship_to_state: "IL",
  ship_to_zip: "62702",
  ship_to_country_as_iso: "US",
  ship_to_is_US_residential: true,
  order_item_name: "Bracket",
  order_quantity: 2,
  order_image_url: "https://example.com/bracket.png",
  order_sku: "SKU-1",
  order_item_color: "black",
};

describe("OrdersResource", () => {
  it("posts to the guessed order path with the exact request body and returns the typed response", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { message: "success", orderId: "abc-123" }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
    const orders = new OrdersResource(client);

    const result = await orders.create(sampleRequest);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://www.slant3dapi.com/api/order");
    expect(calls[0]?.body).toEqual(sampleRequest);
    expect(result).toEqual({ message: "success", orderId: "abc-123" });
  });

  it("returns the typed response even when orderId is absent", async () => {
    const { fetch } = createMockFetch(() =>
      jsonResponse(200, { message: "success" }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
    const orders = new OrdersResource(client);

    const result = await orders.create(sampleRequest);

    expect(result).toEqual({ message: "success" });
  });
});
