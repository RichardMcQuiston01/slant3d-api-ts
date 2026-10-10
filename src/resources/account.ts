import type { HttpClient } from "../http/httpClient.js";
import type { ApiResponse } from "../types.js";

/**
 * API usage. Response `data` shape is unspecified.
 *
 * `GET`/`POST /apiKey` are intentionally not exposed: the OpenAPI spec allows
 * only the web session cookie there, and this client sends only Bearer auth,
 * so every call would fail with a misleading 401.
 */
export class AccountResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /usage`: usage statistics for all of the account's keys. */
  getUsage(): Promise<ApiResponse<unknown>> {
    return this.http.request("GET", "usage");
  }
}
