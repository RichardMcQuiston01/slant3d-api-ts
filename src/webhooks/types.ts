/**
 * @remarks Speculative — inferred from Slant3D's marketing copy ("webhooks
 * for every step": queue, print, QC, shipment), not a confirmed schema.
 * Verify against real webhook payloads before relying on this in
 * production. Exported so consumers building a webhook receiver have a
 * documented starting point, not a verified contract.
 */
export type Slant3dWebhookEventType = "queued" | "printing" | "qc" | "shipped";

/**
 * @remarks Speculative payload shape — see {@link Slant3dWebhookEventType}.
 */
export interface Slant3dWebhookEvent<TData = unknown> {
  event: Slant3dWebhookEventType;
  orderId: string;
  data: TData;
}
