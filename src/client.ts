import { Slant3dConfigError } from "./errors.js";
import { HttpClient } from "./http/httpClient.js";
import { AccountResource } from "./resources/account.js";
import {
  ComponentsResource,
  FilamentsResource,
  HealthResource,
  StationeryResource,
} from "./resources/catalog.js";
import { FilesResource } from "./resources/files.js";
import { OrdersResource } from "./resources/orders.js";
import { PlatformsResource } from "./resources/platforms.js";

/** Options for constructing a {@link Slant3dClient}. */
export interface Slant3dClientOptions {
  /**
   * Slant3D API key (`sl-...`). Falls back to the `SLANT3D_API_TOKEN`
   * environment variable when omitted.
   */
  apiToken?: string;
  /** Override the API base URL. Defaults to `https://slant3dapi.com/v2/api/`. */
  baseUrl?: string;
  /** Inject a custom `fetch` implementation. Mainly useful for tests. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Max automatic retries for `GET` requests only. Defaults to 2. */
  maxRetries?: number;
  /** Base delay for retry backoff in milliseconds. Defaults to 500. */
  retryBaseDelayMs?: number;
  /**
   * Maximum response body size in bytes; larger bodies throw
   * `Slant3dResponseTooLargeError`. Unlimited by default.
   */
  maxResponseBytes?: number;
  /** Allow `http:` presigned upload URLs. For local test servers only. */
  allowInsecureUploadUrl?: boolean;
}

/**
 * Entry point for the Slant3D V2 API client. Operations are grouped by
 * resource, e.g. `client.orders.createDraft(...)`.
 */
export class Slant3dClient {
  /** @internal */
  protected readonly http: HttpClient;

  readonly files: FilesResource;
  readonly orders: OrdersResource;
  readonly platforms: PlatformsResource;
  readonly components: ComponentsResource;
  readonly filaments: FilamentsResource;
  readonly stationery: StationeryResource;
  readonly account: AccountResource;
  readonly health: HealthResource;

  constructor(options: Slant3dClientOptions = {}) {
    const apiToken: string | undefined = options.apiToken ?? readEnvToken();
    if (!apiToken) {
      throw new Slant3dConfigError(
        "Slant3dClient requires an apiToken (pass { apiToken } or set the SLANT3D_API_TOKEN environment variable).",
      );
    }

    const fetchImpl: typeof fetch = options.fetch ?? fetch;
    this.http = new HttpClient({
      apiToken,
      baseUrl: options.baseUrl,
      fetchImpl,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs,
      maxResponseBytes: options.maxResponseBytes,
      allowInsecureUploadUrl: options.allowInsecureUploadUrl,
    });

    this.files = new FilesResource(this.http);
    this.orders = new OrdersResource(this.http);
    this.platforms = new PlatformsResource(this.http);
    this.components = new ComponentsResource(this.http);
    this.filaments = new FilamentsResource(this.http);
    this.stationery = new StationeryResource(this.http);
    this.account = new AccountResource(this.http);
    this.health = new HealthResource(this.http);
  }
}

function readEnvToken(): string | undefined {
  return typeof process !== "undefined"
    ? process.env?.SLANT3D_API_TOKEN
    : undefined;
}
