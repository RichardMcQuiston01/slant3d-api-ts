import type { ClientCall } from "./clientOperations.js";
import type { SpecOperation } from "./specOperations.js";

export interface SpecDiff {
  /** Spec operations that no client method performs. */
  missingFromClient: string[];
  /** Client operations the spec does not define. */
  unknownToSpec: string[];
  /** Query parameter names the client sends that the spec does not list. */
  unknownQueryParams: string[];
  /** Body properties the client sends that the spec does not describe. */
  unknownBodyProperties: string[];
}

/** Compares what the client calls with what the OpenAPI spec defines. */
export function diffAgainstSpec(
  clientCalls: readonly ClientCall[],
  specOperations: ReadonlyMap<string, SpecOperation>,
): SpecDiff {
  const diff: SpecDiff = {
    missingFromClient: [],
    unknownToSpec: [],
    unknownQueryParams: [],
    unknownBodyProperties: [],
  };
  const covered = new Set<string>();

  for (const call of clientCalls) {
    covered.add(call.key);
    const operation: SpecOperation | undefined = specOperations.get(call.key);
    if (operation === undefined) {
      diff.unknownToSpec.push(`${call.key} (client method ${call.method})`);
      continue;
    }
    for (const queryKey of call.queryKeys) {
      if (!operation.queryParams.has(queryKey)) {
        diff.unknownQueryParams.push(
          `${call.key}: "${queryKey}" (client method ${call.method})`,
        );
      }
    }
    if (operation.bodyProperties !== undefined) {
      for (const bodyKey of call.bodyKeys) {
        if (!operation.bodyProperties.has(bodyKey)) {
          diff.unknownBodyProperties.push(
            `${call.key}: "${bodyKey}" (client method ${call.method})`,
          );
        }
      }
    }
  }

  for (const key of specOperations.keys()) {
    if (!covered.has(key)) {
      diff.missingFromClient.push(key);
    }
  }
  return diff;
}

export function hasDifferences(diff: SpecDiff): boolean {
  return Object.values(diff).some((entries: string[]) => entries.length > 0);
}

/** Human-readable report; empty string when there is nothing to report. */
export function formatDiff(diff: SpecDiff): string {
  const sections: [string, string[]][] = [
    ["In the spec but not implemented by the client", diff.missingFromClient],
    ["Implemented by the client but not in the spec", diff.unknownToSpec],
    ["Query parameters the spec does not list", diff.unknownQueryParams],
    ["Body properties the spec does not describe", diff.unknownBodyProperties],
  ];
  return sections
    .filter(([, entries]) => entries.length > 0)
    .map(
      ([title, entries]) =>
        `${title}:\n${entries.map((entry: string) => `  - ${entry}`).join("\n")}`,
    )
    .join("\n\n");
}
