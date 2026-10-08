import { describe, expect, test } from "bun:test";
import { Slant3dClient } from "../src/client.js";
import { COMPOSITE_METHODS, INVOCATIONS, collectClientCalls } from "./clientOperations.js";
import {
  diffAgainstSpec,
  formatDiff,
  hasDifferences,
} from "./specDiff.js";
import {
  extractOperations,
  normalizePath,
  type OpenApiDocument,
} from "./specOperations.js";

const SAMPLE_SPEC: OpenApiDocument = {
  openapi: "3.0.3",
  info: { version: "2.0.0" },
  components: {
    schemas: {
      Thing: { properties: { name: {}, size: {} } },
    },
  },
  paths: {
    "/things": {
      get: {
        parameters: [
          { name: "page", in: "query" },
          { name: "id", in: "path" },
        ],
      },
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } },
        },
      },
    },
    "/things/{thingId}": { delete: {} },
  },
};

describe("normalizePath", () => {
  test("replaces parameter names with {}", () => {
    expect(normalizePath("/files/{publicFileId}/estimate")).toBe("/files/{}/estimate");
  });

  test("adds a leading slash", () => {
    expect(normalizePath("health/status")).toBe("/health/status");
  });
});

describe("extractOperations", () => {
  test("collects methods, query parameters and body properties", () => {
    const operations = extractOperations(SAMPLE_SPEC);
    expect([...operations.keys()].sort()).toEqual([
      "DELETE /things/{}",
      "GET /things",
      "POST /things",
    ]);
    expect([...(operations.get("GET /things")?.queryParams ?? [])]).toEqual(["page"]);
    expect([...(operations.get("POST /things")?.bodyProperties ?? [])]).toEqual([
      "name",
      "size",
    ]);
  });
});

describe("diffAgainstSpec", () => {
  const operations = extractOperations(SAMPLE_SPEC);

  test("reports nothing when the client matches the spec", () => {
    const diff = diffAgainstSpec(
      [
        { method: "a", key: "GET /things", queryKeys: ["page"], bodyKeys: [] },
        { method: "b", key: "POST /things", queryKeys: [], bodyKeys: ["name"] },
        { method: "c", key: "DELETE /things/{}", queryKeys: [], bodyKeys: [] },
      ],
      operations,
    );
    expect(hasDifferences(diff)).toBe(false);
    expect(formatDiff(diff)).toBe("");
  });

  test("reports missing, unknown, and mismatched operations", () => {
    const diff = diffAgainstSpec(
      [
        { method: "a", key: "GET /things", queryKeys: ["page", "bogus"], bodyKeys: [] },
        { method: "b", key: "POST /things", queryKeys: [], bodyKeys: ["bogus"] },
        { method: "c", key: "GET /extra", queryKeys: [], bodyKeys: [] },
      ],
      operations,
    );
    expect(diff.missingFromClient).toEqual(["DELETE /things/{}"]);
    expect(diff.unknownToSpec).toEqual(["GET /extra (client method c)"]);
    expect(diff.unknownQueryParams).toEqual(['GET /things: "bogus" (client method a)']);
    expect(diff.unknownBodyProperties).toEqual(['POST /things: "bogus" (client method b)']);
    expect(hasDifferences(diff)).toBe(true);
  });
});

describe("client operation coverage", () => {
  test("every public resource method has an invocation", () => {
    const client = new Slant3dClient({ apiToken: "t", fetch: globalThis.fetch });
    const discovered: string[] = [];
    for (const [resourceName, resource] of Object.entries(client)) {
      if (resourceName === "http" || typeof resource !== "object" || resource === null) {
        continue;
      }
      const prototype: object = Object.getPrototypeOf(resource) as object;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (
          methodName !== "constructor" &&
          typeof (resource as Record<string, unknown>)[methodName] === "function"
        ) {
          discovered.push(`${resourceName}.${methodName}`);
        }
      }
    }

    const unaccounted: string[] = discovered.filter(
      (name: string) => !(name in INVOCATIONS) && !COMPOSITE_METHODS.has(name),
    );
    const stale: string[] = Object.keys(INVOCATIONS).filter(
      (name: string) => !discovered.includes(name),
    );
    expect(unaccounted).toEqual([]);
    expect(stale).toEqual([]);
  });

  test("each invocation makes exactly one HTTP call", async () => {
    const calls = await collectClientCalls();
    expect(calls).toHaveLength(Object.keys(INVOCATIONS).length);
  });
});
