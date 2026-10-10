/**
 * Compares the client against the Slant3D V2 OpenAPI spec and exits non-zero
 * when they have drifted apart.
 *
 *   bun run spec:diff [spec-url-or-file]
 *
 * The source defaults to `SLANT3D_SPEC_SOURCE`, then the production URL.
 */
import { collectClientCalls, UNSUPPORTED_OPERATIONS } from "./clientOperations.js";
import { diffAgainstSpec, formatDiff, hasDifferences } from "./specDiff.js";
import {
  DEFAULT_SPEC_URL,
  extractOperations,
  loadSpec,
} from "./specOperations.js";

async function main(): Promise<number> {
  const source: string =
    process.argv[2] ?? process.env.SLANT3D_SPEC_SOURCE ?? DEFAULT_SPEC_URL;

  let specOperations;
  let specVersion: string;
  try {
    const document = await loadSpec(source);
    specOperations = extractOperations(document);
    specVersion = document.info.version;
  } catch (cause) {
    console.error(`Could not load the OpenAPI spec: ${String(cause)}`);
    return 2;
  }

  const clientCalls = await collectClientCalls();
  const diff = diffAgainstSpec(
    clientCalls,
    specOperations,
    new Set(UNSUPPORTED_OPERATIONS.keys()),
  );

  console.log(
    `Spec ${source} (version ${specVersion}): ${specOperations.size} operations, ` +
      `client performs ${clientCalls.length}.`,
  );
  if (!hasDifferences(diff)) {
    console.log("Client and spec are in sync.");
    return 0;
  }
  console.error(`\n${formatDiff(diff)}`);
  return 1;
}

process.exit(await main());
