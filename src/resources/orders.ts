import { HttpClient } from "../http/httpClient.js";

/**
 * Request payload for {@link OrdersResource.create}.
 *
 * @remarks
 * **Unconfirmed / community-sourced schema.** Every field on this interface
 * was reverse-engineered from a third-party community wiki documenting the
 * Slant3D API, not from official Slant3D documentation — the official docs
 * are a client-rendered SPA that could not be scraped at the time this
 * client was written. Field names, casing, requiredness, and even the set
 * of fields accepted by the live API are all unverified. Treat this shape as
 * a best-effort guess, not a guaranteed contract.
 *
 * Field names deliberately mirror the community-documented wire format
 * (snake_case in most billing/shipping/order fields) rather than being
 * translated into an idiomatic camelCase DTO. This is a conscious choice:
 * with this much schema uncertainty, a translation/mapper layer is just
 * another place to introduce bugs. Mirroring the wire format directly means
 * this interface can be trivially find-and-replaced once the real schema is
 * confirmed against a live account.
 */
export interface CreateOrderRequest {
  /**
   * Customer email address.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  email: string;
  /**
   * Customer phone number.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  phone: string;
  /**
   * Customer name.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  name: string;
  /**
   * Caller-supplied order number/reference.
   *
   * @remarks Unconfirmed field, sourced from community documentation. It is
   * unclear whether this must be unique per Slant3D account.
   */
  orderNumber: string;
  /**
   * Filename of the model being ordered.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  filename: string;
  /**
   * Publicly reachable URL to the model file. Assumed, by analogy with the
   * quoting endpoint, that Slant3D does not follow redirects.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  fileURL: string;
  /**
   * Billing address line 1.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_street_1: string;
  /**
   * Billing address line 2.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_street_2?: string;
  /**
   * Billing address line 3.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_street_3?: string;
  /**
   * Billing address city.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_city: string;
  /**
   * Billing address state/province.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_state: string;
  /**
   * Billing address postal code.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_zip: string;
  /**
   * Billing address country, as an ISO country code.
   *
   * @remarks Unconfirmed field, sourced from community documentation. The
   * exact ISO format expected (alpha-2 vs alpha-3) is unverified.
   */
  bill_to_country_as_iso: string;
  /**
   * Whether the billing address is a US residential address.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  bill_to_is_US_residential: boolean;
  /**
   * Shipping recipient name.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_name: string;
  /**
   * Shipping address line 1.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_street_1: string;
  /**
   * Shipping address line 2.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_street_2?: string;
  /**
   * Shipping address line 3.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_street_3?: string;
  /**
   * Shipping address city.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_city: string;
  /**
   * Shipping address state/province.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_state: string;
  /**
   * Shipping address postal code.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_zip: string;
  /**
   * Shipping address country, as an ISO country code.
   *
   * @remarks Unconfirmed field, sourced from community documentation. The
   * exact ISO format expected (alpha-2 vs alpha-3) is unverified.
   */
  ship_to_country_as_iso: string;
  /**
   * Whether the shipping address is a US residential address.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  ship_to_is_US_residential: boolean;
  /**
   * Name of the ordered item/line item.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  order_item_name: string;
  /**
   * Quantity of the ordered item.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  order_quantity: number;
  /**
   * Optional image URL representing the ordered item.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  order_image_url?: string;
  /**
   * Optional SKU for the ordered item.
   *
   * @remarks Unconfirmed field, sourced from community documentation.
   */
  order_sku?: string;
  /**
   * Optional print color for the ordered item.
   *
   * @remarks Unconfirmed field, sourced from community documentation. The
   * set of valid color values (if any are enforced server-side) is unknown.
   */
  order_item_color?: string;
}

/**
 * Response payload returned by {@link OrdersResource.create}.
 *
 * @remarks
 * **Unconfirmed / community-sourced schema.** As with {@link CreateOrderRequest},
 * this shape is a guess based on third-party community documentation, not a
 * verified API contract. `orderId` in particular may not exist, may be named
 * differently, or may be nested under a different key on the live API.
 */
export interface CreateOrderResponse {
  /** Human-readable status message from the API. */
  message: string;
  /**
   * Identifier for the created order.
   *
   * @remarks Shape unconfirmed — this field's existence, name, and type are
   * all guesses based on community documentation, not verified against a
   * live response.
   */
  orderId?: string;
}

/**
 * Client for Slant3D's order-creation endpoint.
 *
 * @remarks
 * **This is the riskiest module in this package.** Order creation was
 * reverse-engineered from a third-party community wiki testing the Slant3D
 * API, not from official documentation (which is a client-rendered SPA that
 * could not be scraped). Neither the request/response schema nor the
 * endpoint path itself are confirmed. Do not treat anything in this module
 * as a verified API contract — validate against a live Slant3D account
 * before depending on it in production.
 */
export class OrdersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Submits an order for printing and shipping.
   *
   * @remarks
   * The endpoint path used here (`order`) is an unconfirmed guess — see the
   * `TODO(verify-live-api)` comment on the path below. The request/response
   * shapes are likewise unconfirmed community-sourced guesses; see
   * {@link CreateOrderRequest} and {@link CreateOrderResponse}.
   *
   * @param request - The order request, including customer, billing,
   * shipping, and line-item details.
   * @returns The order-creation response.
   */
  create(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    return this.http.request<CreateOrderResponse>(
      "POST",
      // TODO(verify-live-api): endpoint path is an unconfirmed guess (POST /order vs /orders)
      "order",
      request,
    );
  }
}
