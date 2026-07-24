import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { QuotesResource } from "./quotes.js";

describe("QuotesResource", () => {
  it("posts to slicer with the request body and returns the typed response", async () => {
    const { fetch, calls } = createMockFetch(() =>
      jsonResponse(200, { message: "success", data: { price: 12.5 } }),
    );
    const client = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
    const quotes = new QuotesResource(client);

    const result = await quotes.create({
      fileURL: "https://example.com/model.stl",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://www.slant3dapi.com/api/slicer");
    expect(calls[0]?.body).toEqual({
      fileURL: "https://example.com/model.stl",
    });
    expect(result).toEqual({ message: "success", data: { price: 12.5 } });
  });
});
