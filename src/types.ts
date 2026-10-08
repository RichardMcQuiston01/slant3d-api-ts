/**
 * Types mirroring the Slant3D V2 OpenAPI spec
 * (`GET https://slant3dapi.com/v2/api/openapi.json`, version 2.0.0).
 *
 * Property names intentionally match the wire format exactly, including its
 * mix of camelCase and snake_case, so no mapping layer sits between this
 * client and the API.
 */

/** Standard response envelope returned by every JSON endpoint. */
export interface ApiResponse<TData = unknown> {
  success: boolean;
  /** Human-readable message. Some endpoints (e.g. health) omit it. */
  message?: string;
  data: TData;
}

export interface Pagination {
  /** Total records matching the request, across all pages. */
  count: number;
  totalPages: number;
  page: number;
  limit: number;
}

/** Envelope for list endpoints that include a record `count`. */
export interface CountedResponse<TItem> extends ApiResponse<TItem[]> {
  count: number;
}

/** Envelope for paginated list endpoints. */
export interface PaginatedResponse<TItem> extends ApiResponse<TItem[]> {
  pagination: Pagination;
}

export interface PaginationQuery {
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 50. */
  limit?: number;
}

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  /** Defaults to `US`. */
  country?: string;
}

export interface CustomerDetails {
  email: string;
  address: Address;
}

export interface Customer {
  publicPaymentServiceId?: string;
  platformId?: string;
  details?: Partial<CustomerDetails>;
  createdAt?: string;
  updatedAt?: string;
}

export interface FileMetrics {
  bodyCount?: number;
  imageURL?: string;
  /** Estimated print time in minutes. */
  printTimeEstimate?: number;
  /** Estimated weight in grams. */
  weight?: number;
  /** Surface area in square millimeters. */
  surfaceArea?: number;
  supportRequired?: boolean;
  supportVolumeEstimate?: number;
  /** Estimated volume in cubic centimeters. */
  volume?: number;
  /** Axis sizes in millimeters; `z` is vertical while printing. */
  x?: number;
  y?: number;
  z?: number;
  units?: Record<string, string>;
}

export interface Slant3dFile {
  publicFileServiceId: string;
  name: string;
  ownerId?: string;
  platformId: string;
  /** Currently only `stl`. */
  type: "stl";
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Presigned download URL (1 hour expiry). */
  fileURL?: string;
  metrics?: FileMetrics;
}

export type OrderItemType = "PRINT" | "COMPONENT" | "STATIONERY";

export type OrderItemStatus = "PROCESSING" | "READY" | "SHIPPED" | "DELIVERED";

export interface OrderItem {
  type: OrderItemType;
  status?: OrderItemStatus;
  /** Fixed-point decimal string with two places; parse with a decimal type. */
  price?: string;
  /** ISO 4217 code; currently always `USD`. */
  currency?: string;
  quantity: number;
  name?: string | null;
  SKU?: string | null;
  publicFileServiceId?: string;
  filamentId?: string;
  componentId?: string;
  stationeryId?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OrderStatus =
  | "DRAFT"
  | "PAID"
  | "QUEUED"
  | "PRINTING"
  | "ITEMS_ON_SHELF"
  | "POST_PROCESSING"
  | "COMPLETED"
  | "IN_REVIEW"
  | "AWAITING_SHIPMENT"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELED"
  | "PAYMENT_ERROR";

export interface Order {
  /** Public identifier, `SLANT_XXXXXXXXXX`. */
  publicId: string;
  status: OrderStatus;
  platformId: string;
  ownerId?: string;
  creatorId?: string;
  paymentId?: string | null;
  processedAt?: string | null;
  arriveByDate?: string | null;
  /** Shipping cost in USD, as a decimal string. */
  deliveryCost?: string;
  /** Print cost in USD, as a decimal string. */
  printingCost?: string;
  customer?: Customer;
  /** Shipping and tracking information. Shape is not specified by the API. */
  fulfillment?: Record<string, unknown> | null;
  items: OrderItem[];
  options?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Platform {
  id: string;
  name: string;
  description?: string;
  url?: string;
  webhookURL?: string;
  /** HMAC-SHA256 signing key for this platform's webhooks. */
  webhookSecret?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Component {
  id: string;
  name: string;
  description?: string;
  /** Price per unit in USD. */
  price: number;
  priceUnit: "USD";
  weight: number;
  weightUnit: "g";
  imageUrl?: string;
  /** Formatted `X x Y x Z` string. */
  dimensions?: string;
  dimensionUnit: "mm";
  categoryId?: string;
  tags: string[];
}

export interface ComponentCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export type FilamentProfile = "OPM" | "PLA" | "PETG";

export interface Filament {
  publicId: string;
  name: string;
  provider: string;
  profile: FilamentProfile;
  /** Space separated, always lower case, e.g. `matte black`. */
  color: string;
  /** Six digit lower case hex, e.g. `#a1a1a1`. */
  hexValue: string;
  /** Omitted per the spec when there is no image, but the API sends `""`. */
  imageURL?: string;
  available?: boolean;
}

export interface Stationery {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  weight?: number | null;
  image_url?: string | null;
  dimensions?: string;
  quantity?: number;
  public?: boolean;
  available?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceHealth {
  healthy: boolean;
  lastCheckedAt: string | null;
}
