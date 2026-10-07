import type { HttpClient } from "../http/httpClient.js";
import type {
  ApiResponse,
  CountedResponse,
  CustomerDetails,
  Order,
  OrderItemType,
  PaginationQuery,
} from "../types.js";

/** A single line item on a {@link CreateOrderRequest}. */
export interface CreateOrderItem {
  type: OrderItemType;
  /** Defaults to 1. */
  quantity?: number;
  /** Required for `PRINT` items. */
  publicFileServiceId?: string;
  /** Optional for `PRINT` items. */
  filamentId?: string;
  /** Required for `COMPONENT` items. */
  componentId?: string;
  /** Required for `STATIONERY` items. */
  stationeryId?: string;
  /** `STATIONERY` items with a custom image. */
  imageUrl?: string;
}

/** Request body for {@link OrdersResource.createDraft}. */
export interface CreateOrderRequest {
  platformId: string;
  /** Your application's user id. */
  ownerId?: string;
  customer: {
    details: CustomerDetails;
    /** Customer payment id for direct billing. */
    publicPaymentServiceId?: string;
  };
  items: CreateOrderItem[];
}

export interface ListOrdersQuery extends PaginationQuery {
  platformId?: string;
  ownerId?: string;
  /** Only these statuses are accepted as list filters. */
  status?: "DRAFT" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELED";
  /** `YYYY-MM-DD`. */
  startDate?: string;
  endDate?: string;
}

/** Response data wrapper for single-order endpoints. */
export interface OrderData {
  order: Order;
}

/**
 * Orders. Workflow: upload files, {@link createDraft}, then {@link process}
 * to charge payment and begin production. Status changes arrive by webhook.
 */
export class OrdersResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /orders` */
  list(query: ListOrdersQuery = {}): Promise<CountedResponse<Order>> {
    return this.http.request("GET", "orders", { query: { ...query } });
  }

  /** `GET /orders/search` */
  search(query: string): Promise<ApiResponse<Order[]>> {
    return this.http.request("GET", "orders/search", { query: { query } });
  }

  /** `GET /orders/{publicOrderId}` */
  get(publicOrderId: string): Promise<ApiResponse<OrderData>> {
    return this.http.request("GET", `orders/${encodeURIComponent(publicOrderId)}`);
  }

  /** `POST /orders/batch` */
  getMany(publicOrderIds: string[]): Promise<ApiResponse<OrderData[]>> {
    return this.http.request("POST", "orders/batch", {
      body: { public_ids: publicOrderIds },
    });
  }

  /**
   * `POST /orders`. Creates a **draft** order to estimate costs. Nothing is
   * charged or printed until {@link process} is called.
   */
  createDraft(request: CreateOrderRequest): Promise<ApiResponse<OrderData>> {
    return this.http.request("POST", "orders", { body: request });
  }

  /**
   * `POST /orders/{publicOrderId}`. Processes a draft order: charges payment
   * and begins production. Never retried automatically.
   */
  process(publicOrderId: string): Promise<ApiResponse<OrderData>> {
    return this.http.request("POST", `orders/${encodeURIComponent(publicOrderId)}`);
  }

  /** `DELETE /orders/{publicOrderId}` */
  cancel(publicOrderId: string): Promise<ApiResponse<undefined>> {
    return this.http.request("DELETE", `orders/${encodeURIComponent(publicOrderId)}`);
  }
}
