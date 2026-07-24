import { HttpClient } from "../http/httpClient.js";

/**
 * Request payload for {@link QuotesResource.create}.
 *
 * @remarks
 * `fileURL` is the only field observed in third-party community
 * documentation for this endpoint — there is no official/verified schema.
 * It is unconfirmed whether the endpoint accepts additional fields (e.g.
 * quantity, color, material) or whether such fields would affect the
 * returned price; the price returned here may reflect a single default
 * unit only.
 */
export interface CreateQuoteRequest {
  /** Publicly reachable URL to an STL file. Slant3D does not follow redirects. */
  fileURL: string;
}

/** Response payload returned by {@link QuotesResource.create}. */
export interface CreateQuoteResponse {
  /** Human-readable status message from the API. */
  message: string;
  /** Quote details. */
  data: {
    /** Quoted price for printing the supplied model. */
    price: number;
  };
}

/**
 * Client for Slant3D's quoting endpoint.
 *
 * @remarks
 * This is the best-documented Slant3D endpoint, but the documentation is
 * third-party/community-sourced rather than official. Treat the request and
 * response shapes here as observed behavior, not a guaranteed contract.
 */
export class QuotesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Requests a print price quote for a publicly reachable STL file.
   *
   * @param request - The quote request, including the STL file URL.
   * @returns The quoted price for the model.
   */
  create(request: CreateQuoteRequest): Promise<CreateQuoteResponse> {
    return this.http.request("POST", "slicer", request);
  }
}
