import type { HttpClient } from "../http/httpClient.js";
import type { ApiResponse } from "../types.js";

/** API usage and API key management. Response `data` shapes are unspecified. */
export class AccountResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /usage`: usage statistics for all of the account's keys. */
  getUsage(): Promise<ApiResponse<unknown>> {
    return this.http.request("GET", "usage");
  }

  /** `GET /apiKey` */
  listApiKeys(): Promise<ApiResponse<unknown>> {
    return this.http.request("GET", "apiKey");
  }

  /** `POST /apiKey`: an account may hold at most 3 keys. */
  createApiKey(name: string): Promise<ApiResponse<unknown>> {
    return this.http.request("POST", "apiKey", { body: { name } });
  }
}
