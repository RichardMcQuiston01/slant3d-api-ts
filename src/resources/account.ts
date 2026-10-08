import type { HttpClient } from "../http/httpClient.js";
import type { ApiResponse } from "../types.js";

/**
 * API usage and API key management. Response `data` shapes are unspecified.
 *
 * Note: per the OpenAPI spec, `GET`/`POST /apiKey` accept only the web
 * session cookie, not a Bearer API key. With this client's Bearer auth they
 * respond 401 (`Slant3dAuthenticationError`), so {@link listApiKeys} and
 * {@link createApiKey} are only useful if you supply a custom `fetch` that
 * adds a session cookie.
 */
export class AccountResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /usage`: usage statistics for all of the account's keys. */
  getUsage(): Promise<ApiResponse<unknown>> {
    return this.http.request("GET", "usage");
  }

  /** `GET /apiKey`: session-cookie auth only, see the class note. */
  listApiKeys(): Promise<ApiResponse<unknown>> {
    return this.http.request("GET", "apiKey");
  }

  /** `POST /apiKey`: session-cookie auth only. An account may hold at most 3 keys. */
  createApiKey(name: string): Promise<ApiResponse<unknown>> {
    return this.http.request("POST", "apiKey", { body: { name } });
  }
}
