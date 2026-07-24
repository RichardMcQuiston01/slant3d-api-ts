import { HttpClient } from "../http/httpClient.js";

/**
 * Response payload returned by {@link TrackingResource.getStatus}.
 *
 * @remarks
 * Placeholder. No tracking/status endpoint has been confirmed against live
 * Slant3D documentation or API access — verify the path, method, and
 * response shape before relying on this in production. Slant3D's marketing
 * materials mention "live order tracking" as a capability, but the official
 * docs are a client-rendered SPA that could not be scraped, and the
 * community wiki that documented order creation did not cover tracking.
 * Every field below (including whether `status` is a free-form string, an
 * enum, or something else entirely) is an unverified guess.
 */
export interface OrderStatus {
  /** Unverified guess: assumed to echo back the order identifier supplied to the request. */
  orderId: string;
  /**
   * Unverified guess: assumed to be a human-readable or enum-like status
   * string (e.g. "queued", "printing", "shipped"). No known values have
   * been confirmed against a real API response.
   */
  status: string;
}

/**
 * Client for Slant3D's (unconfirmed) order tracking/status endpoint.
 *
 * @remarks
 * TODO(verify-live-api): This entire module is speculative. Unlike the
 * quotes endpoint, which is at least grounded in third-party community
 * documentation, no source — official or community — documents
 * an order tracking/status endpoint. The path, HTTP method, request shape,
 * and response shape below are all guesses made so v1 ships a
 * complete-looking surface. Do not treat any behavior here as verified;
 * confirm against live Slant3D API access (or official docs, once
 * scrapeable) before shipping code that depends on it.
 */
export class TrackingResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Requests the current status of a previously placed order.
   *
   * @remarks
   * TODO(verify-live-api): endpoint path (`order/{orderId}`), HTTP method
   * (`GET`), and response shape (`{ orderId, status }`) are an unconfirmed
   * guess, not sourced from any documentation — placeholder so v1 ships a
   * complete-looking surface. Verify all of these against the live Slant3D
   * API before relying on this method.
   *
   * @param orderId - The order identifier to look up.
   * @returns The (unverified) order status.
   */
  getStatus(orderId: string): Promise<OrderStatus> {
    return this.http.request("GET", `order/${orderId}`);
  }
}
