export type WebhookEventType =
  | "order.created"
  | "order.updated"
  | "order.cancelled"
  | "order.shipped"
  | "order.delivered"
  | "order.error"
  | "payment.completed"
  | "payment.failed"
  | "customer.updated"
  | "file.updated"
  | "component.created"
  | "component.updated"
  | "component.deleted"
  | "filament.updated";

export type WebhookService =
  | "order-service"
  | "payment-service"
  | "file-service"
  | "print-service";

/** The order portion of `order.*` webhook data. */
export interface WebhookOrderData {
  public_id: string;
  status: string;
  tracking_number?: string;
  shipment_status?: string;
}

/** The component portion of `component.*` webhook data. */
export interface WebhookComponentData {
  id: string;
  name?: string;
  price?: number;
  weight?: number;
  description?: string;
  dimensions?: string;
  image_url?: string;
}

/** `filament.updated` carries public ids only; refetch `GET /filaments`. */
export interface WebhookFilamentData {
  added: string[];
  updated: string[];
  removed: string[];
}

interface WebhookBase<TType extends WebhookEventType, TData> {
  event_type: TType;
  service: WebhookService;
  /** Your platform id. */
  platform_id: string;
  /** Unix milliseconds, as a string. */
  timestamp?: string;
  data: TData;
}

export type OrderWebhookEventType = Extract<
  WebhookEventType,
  | "order.created"
  | "order.updated"
  | "order.cancelled"
  | "order.shipped"
  | "order.delivered"
  | "order.error"
>;

export type ComponentWebhookEventType = Extract<
  WebhookEventType,
  "component.created" | "component.updated" | "component.deleted"
>;

export type OrderWebhookEvent = WebhookBase<
  OrderWebhookEventType,
  { order: WebhookOrderData }
>;

export type ComponentWebhookEvent = WebhookBase<
  ComponentWebhookEventType,
  { component: WebhookComponentData }
>;

export type FilamentWebhookEvent = WebhookBase<
  "filament.updated",
  { filaments: WebhookFilamentData }
>;

/**
 * Payment, customer, and file events are validated by the API but their
 * `data` shape is not documented, so it is left open.
 */
export type OtherWebhookEvent = WebhookBase<
  "payment.completed" | "payment.failed" | "customer.updated" | "file.updated",
  Record<string, unknown>
>;

/** The body Slant3D POSTs to a platform's `webhookURL`. */
export type WebhookEvent =
  | OrderWebhookEvent
  | ComponentWebhookEvent
  | FilamentWebhookEvent
  | OtherWebhookEvent;

/** The body accepted by `POST /slant/webhook` (custom test webhooks). */
export type WebhookPayload = WebhookEvent;
