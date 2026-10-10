import { describe, expect, test } from "bun:test";
import { SpecResponseValidator } from "./specValidator.js";
import type { OpenApiDocument } from "./specOperations.js";

const SPEC: OpenApiDocument = {
  openapi: "3.0.3",
  info: { version: "2.0.0" },
  components: {
    schemas: {
      ApiResponse: {
        type: "object",
        required: ["success"],
        properties: { success: { type: "boolean" } },
      },
      Widget: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
          note: { type: "string", nullable: true },
        },
      },
    },
  },
  paths: {
    "/widgets/{widgetId}": {
      get: {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiResponse" },
                    {
                      type: "object",
                      properties: { data: { $ref: "#/components/schemas/Widget" } },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
} as unknown as OpenApiDocument;

const UUID: string = "00000000-0000-4000-8000-000000000000";

describe("SpecResponseValidator", () => {
  const validator = new SpecResponseValidator(SPEC);

  test("accepts a body that matches, including nullable fields", () => {
    const result = validator.validate("GET /widgets/{}", {
      success: true,
      data: { id: UUID, note: null },
    });
    expect(result).toEqual({ valid: true, errors: [], ignored: [] });
  });

  test("describes where a body deviates from the schema", () => {
    const result = validator.validate("GET /widgets/{}", {
      success: "yes",
      data: { id: "not-a-uuid" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/success");
    expect(result.errors.join("\n")).toContain("/data/id");
  });

  test("tolerates a missing message and non-uri URL strings", () => {
    const lenient = new SpecResponseValidator({
      ...SPEC,
      components: {
        schemas: {
          ApiResponse: {
            type: "object",
            required: ["success", "message"],
            properties: { success: { type: "boolean" } },
          },
          Widget: {
            type: "object",
            properties: { imageUrl: { type: "string", format: "uri" } },
          },
        },
      },
    } as unknown as OpenApiDocument);
    const result = lenient.validate("GET /widgets/{}", {
      success: true,
      data: { imageUrl: "not a uri" },
    });
    expect(result.valid).toBe(true);
    expect(result.ignored.join("\n")).toContain("[missing-message]");
    expect(result.ignored.join("\n")).toContain('[uri-format]');
    expect(result.ignored.join("\n")).toContain("not a uri");
  });

  test("rejects an operation the spec does not define", () => {
    expect(validator.validate("GET /nope", {}).valid).toBe(false);
  });
});
