import { Slant3dConfigError } from "./errors.js";
import { HttpClient } from "./http/httpClient.js";

/** Options for constructing a {@link Slant3dClient}. */
export interface Slant3dClientOptions {
  /**
   * Slant3D team API token. Falls back to the `SLANT3D_API_TOKEN`
   * environment variable when omitted.
   */
  apiToken?: string;
  /** Override the API base URL. Mainly useful for tests. */
  baseUrl?: string;
  /** Inject a custom `fetch` implementation. Mainly useful for tests. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * Entry point for the Slant3D API client. Resource-specific operations are
 * grouped under sub-clients, e.g. `client.quotes.create(...)`.
 */
export class Slant3dClient {
  /** @internal */
  protected readonly http: HttpClient;

  constructor(options: Slant3dClientOptions = {}) {
    const apiToken = options.apiToken ?? readEnvToken();
    if (!apiToken) {
      throw new Slant3dConfigError(
        "Slant3dClient requires an apiToken (pass { apiToken } or set the SLANT3D_API_TOKEN environment variable).",
      );
    }

    this.http = new HttpClient({
      apiToken,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetch,
      timeoutMs: options.timeoutMs,
    });
  }
}

function readEnvToken(): string | undefined {
  return typeof process !== "undefined"
    ? process.env?.SLANT3D_API_TOKEN
    : undefined;
}
