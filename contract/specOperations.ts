import { readFile } from "node:fs/promises";

/** Default location of the official Slant3D V2 OpenAPI document. */
export const DEFAULT_SPEC_URL = "https://slant3dapi.com/v2/api/openapi.json";

const HTTP_METHODS: readonly string[] = ["get", "post", "put", "patch", "delete"];

interface JsonSchema {
  $ref?: string;
  properties?: Record<string, unknown>;
  allOf?: JsonSchema[];
}

interface SpecParameter {
  name: string;
  in: string;
}

interface SpecOperationObject {
  parameters?: SpecParameter[];
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
}

/** The slice of an OpenAPI 3.0 document that the contract checks rely on. */
export interface OpenApiDocument {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export interface SpecOperation {
  /** `METHOD /normalized/{}` key shared with the client side. */
  key: string;
  method: string;
  /** Path as written in the spec, e.g. `/files/{publicFileId}`. */
  path: string;
  queryParams: ReadonlySet<string>;
  /** Top-level JSON body properties, or `undefined` when not described. */
  bodyProperties: ReadonlySet<string> | undefined;
  /** JSON pointer to the 200 response schema, when one is declared. */
  responseSchemaPointer: string | undefined;
}

/** Replaces every `{param}` segment with `{}` so names do not matter. */
export function normalizePath(path: string): string {
  const withLeadingSlash: string = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.replace(/\{[^}]*\}/g, "{}");
}

export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

/**
 * Loads the OpenAPI document from an `http(s)` URL or a local file path.
 * Throws a descriptive error when the document cannot be fetched or parsed.
 */
export async function loadSpec(
  source: string = DEFAULT_SPEC_URL,
): Promise<OpenApiDocument> {
  let text: string;
  if (/^https?:\/\//.test(source)) {
    let response: Response;
    try {
      response = await fetch(source);
    } catch (cause) {
      throw new Error(`Could not fetch OpenAPI spec from ${source}: ${String(cause)}`);
    }
    if (!response.ok) {
      throw new Error(
        `Fetching OpenAPI spec from ${source} failed with HTTP ${response.status}`,
      );
    }
    text = await response.text();
  } else {
    try {
      text = await readFile(source, "utf8");
    } catch (cause) {
      throw new Error(`Could not read OpenAPI spec file ${source}: ${String(cause)}`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`OpenAPI spec from ${source} is not valid JSON: ${String(cause)}`);
  }
  const document = parsed as Partial<OpenApiDocument>;
  if (document.paths === undefined || document.openapi === undefined) {
    throw new Error(`Document from ${source} does not look like an OpenAPI spec`);
  }
  return document as OpenApiDocument;
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function resolveSchema(
  schema: JsonSchema | undefined,
  document: OpenApiDocument,
): JsonSchema | undefined {
  if (schema?.$ref === undefined) {
    return schema;
  }
  const name: string | undefined = schema.$ref.split("/").pop();
  return name === undefined ? undefined : document.components?.schemas?.[name];
}

function collectProperties(
  schema: JsonSchema | undefined,
  document: OpenApiDocument,
): Set<string> | undefined {
  const resolved: JsonSchema | undefined = resolveSchema(schema, document);
  if (resolved === undefined) {
    return undefined;
  }
  const properties = new Set<string>(Object.keys(resolved.properties ?? {}));
  let described: boolean = resolved.properties !== undefined;
  for (const part of resolved.allOf ?? []) {
    const partProperties: Set<string> | undefined = collectProperties(part, document);
    if (partProperties !== undefined) {
      described = true;
      partProperties.forEach((name: string) => properties.add(name));
    }
  }
  return described ? properties : undefined;
}

/** Flattens the spec into one {@link SpecOperation} per method + path. */
export function extractOperations(
  document: OpenApiDocument,
): Map<string, SpecOperation> {
  const operations = new Map<string, SpecOperation>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as SpecOperationObject | undefined;
      if (operation === undefined) {
        continue;
      }
      const queryParams = new Set<string>(
        (operation.parameters ?? [])
          .filter((parameter: SpecParameter) => parameter.in === "query")
          .map((parameter: SpecParameter) => parameter.name),
      );
      const bodySchema: JsonSchema | undefined =
        operation.requestBody?.content?.["application/json"]?.schema;
      const responses = (operation as { responses?: Record<string, unknown> })
        .responses;
      const hasJsonSchema: boolean =
        (
          responses?.["200"] as
            | { content?: Record<string, { schema?: unknown }> }
            | undefined
        )?.content?.["application/json"]?.schema !== undefined;
      const key: string = operationKey(method, path);
      operations.set(key, {
        key,
        method: method.toUpperCase(),
        path,
        queryParams,
        bodyProperties: collectProperties(bodySchema, document),
        responseSchemaPointer: hasJsonSchema
          ? `#/paths/${escapePointerSegment(path)}/${method}/responses/200/content/application~1json/schema`
          : undefined,
      });
    }
  }
  return operations;
}
