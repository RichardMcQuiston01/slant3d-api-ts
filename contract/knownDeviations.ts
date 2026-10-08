/**
 * Places where the live API is known to differ from the published OpenAPI
 * spec in ways that do not affect this client. Each is reported as a warning
 * by the live tests instead of failing them. Add to this list only with a
 * reason, and remove entries when the API or spec is fixed.
 */
export interface KnownDeviation {
  id: string;
  reason: string;
  /** Matches an Ajv error (keyword, params, instance path). */
  matches: (error: DeviationCandidate) => boolean;
}

export interface DeviationCandidate {
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
}

export const KNOWN_DEVIATIONS: readonly KnownDeviation[] = [
  {
    id: "missing-message",
    reason:
      "The spec's ApiResponse requires `message`, but some endpoints (e.g. GET /usage) omit it. The client types `message` as optional.",
    matches: (error: DeviationCandidate): boolean =>
      error.keyword === "required" &&
      error.instancePath === "" &&
      error.params.missingProperty === "message",
  },
  {
    id: "uri-format",
    reason:
      "Image URL fields are not always strict RFC 3986 URIs: component imageUrl values contain unencoded spaces, filament imageURL is \"\" (not omitted) when there is no image, and platform webhookURL is \"\" when unset. The client treats them as plain strings.",
    matches: (error: DeviationCandidate): boolean =>
      error.keyword === "format" && error.params.format === "uri",
  },
];
