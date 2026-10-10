import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { KNOWN_DEVIATIONS } from "./knownDeviations.js";
import {
  extractOperations,
  type OpenApiDocument,
  type SpecOperation,
} from "./specOperations.js";

// ajv-formats ships CommonJS typings whose default export TypeScript's
// NodeNext resolution sees as the module namespace.
const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

const SPEC_SCHEMA_ID: string = "slant3d-openapi";

/** Result of validating a response body against the spec's 200 schema. */
export interface ValidationResult {
  valid: boolean;
  /** Human-readable problems; empty when `valid` is true. */
  errors: string[];
  /** Known, tolerated deviations (see `knownDeviations.ts`), with values. */
  ignored: string[];
}

/**
 * Validates response bodies against the 200-response schemas declared in an
 * OpenAPI 3.0 document, addressing each by its `METHOD /normalized/{}` key.
 */
export class SpecResponseValidator {
  private readonly ajv: Ajv;
  private readonly operations: ReadonlyMap<string, SpecOperation>;
  private readonly compiled = new Map<string, ValidateFunction>();

  constructor(document: OpenApiDocument) {
    // OpenAPI documents carry non-schema keywords (examples, descriptions).
    this.ajv = new Ajv({
      strict: false,
      allErrors: true,
      validateSchema: false,
      verbose: true,
      logger: false,
    });
    addFormats(this.ajv);
    this.ajv.addSchema(document, SPEC_SCHEMA_ID);
    this.operations = extractOperations(document);
  }

  validate(operationKey: string, body: unknown): ValidationResult {
    const operation: SpecOperation | undefined = this.operations.get(operationKey);
    if (operation === undefined) {
      return {
        valid: false,
        errors: [`No spec operation "${operationKey}"`],
        ignored: [],
      };
    }
    if (operation.responseSchemaPointer === undefined) {
      return { valid: true, errors: [], ignored: [] };
    }

    let validator: ValidateFunction | undefined = this.compiled.get(operationKey);
    if (validator === undefined) {
      validator = this.ajv.compile({
        $ref: `${SPEC_SCHEMA_ID}${operation.responseSchemaPointer}`,
      });
      this.compiled.set(operationKey, validator);
    }
    if (validator(body)) {
      return { valid: true, errors: [], ignored: [] };
    }
    const errors: string[] = [];
    const ignored: string[] = [];
    for (const error of validator.errors ?? []) {
      const description: string = describeError(error);
      const deviation = KNOWN_DEVIATIONS.find((known) =>
        known.matches({
          keyword: error.keyword,
          instancePath: error.instancePath,
          params: error.params as Record<string, unknown>,
        }),
      );
      (deviation === undefined ? errors : ignored).push(
        deviation === undefined ? description : `${description} [${deviation.id}]`,
      );
    }
    return { valid: errors.length === 0, errors, ignored };
  }
}

function describeError(error: ErrorObject): string {
  const base: string = `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`;
  return error.keyword === "format"
    ? `${base} (value: ${JSON.stringify(error.data)})`
    : base;
}
