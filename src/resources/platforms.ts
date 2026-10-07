import type { HttpClient } from "../http/httpClient.js";
import type { WebhookPayload } from "../webhooks/types.js";
import type { ApiResponse, CountedResponse, Platform } from "../types.js";

export interface CreatePlatformRequest {
  name: string;
  url: string;
  description?: string;
  webhookURL?: string;
}

export interface UpdatePlatformRequest {
  name?: string;
  description?: string;
  url?: string;
  webhookURL?: string;
  /**
   * 32-256 printable ASCII characters (0x21-0x7E), used exactly as sent, so
   * trim whitespace first. Replaces the current secret immediately.
   */
  webhookSecret?: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  response?: {
    status?: number;
    statusText?: string;
    body?: string | null;
    error?: string;
    code?: string | null;
  };
}

export type DeadWebhookStatus = "retrying" | "failed" | "delivered" | "expired";

export interface DeadWebhook {
  /** Pass to {@link PlatformsResource.resendDeadWebhook}. */
  id: string;
  creatorId?: string;
  platformId: string;
  webhookURL: string;
  eventType: string;
  service: string;
  payload: WebhookPayload;
  attempts: number;
  retryable: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  succeededAt: string | null;
  expiredAt: string | null;
  expired: boolean;
  status: DeadWebhookStatus;
}

export interface DeadWebhookResendResult {
  id: string;
  eventType: string;
  success: boolean;
  status: number | null;
  expired: boolean;
  alreadyDelivered: boolean;
  error: string | null;
}

export interface DeadWebhookResendSummary {
  attempted: number;
  delivered: number;
  failed: number;
  expired: number;
  /** Still awaiting resend; call again while above zero. */
  remaining: number;
  results: DeadWebhookResendResult[];
}

/**
 * Platforms: the organizational unit that owns files, orders, and a webhook
 * endpoint. Most other requests need a platform id. An account may have up to
 * 5 enabled platforms.
 */
export class PlatformsResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /platforms`: enabled platforms only. */
  list(): Promise<CountedResponse<Platform>> {
    return this.http.request("GET", "platforms");
  }

  /** `POST /platforms` */
  create(request: CreatePlatformRequest): Promise<ApiResponse<Platform>> {
    return this.http.request("POST", "platforms", { body: request });
  }

  /** `GET /platforms/{platformId}`: also returns disabled platforms. */
  get(platformId: string): Promise<ApiResponse<Platform>> {
    return this.http.request("GET", platformPath(platformId));
  }

  /** `PATCH /platforms/{platformId}` */
  update(
    platformId: string,
    request: UpdatePlatformRequest,
  ): Promise<ApiResponse<Platform>> {
    return this.http.request("PATCH", platformPath(platformId), {
      body: request,
    });
  }

  /** `DELETE /platforms/{platformId}`: disables it, freeing a slot. */
  disable(platformId: string): Promise<ApiResponse<undefined>> {
    return this.http.request("DELETE", platformPath(platformId));
  }

  /** `PATCH /platforms/{platformId}/enable` */
  enable(platformId: string): Promise<ApiResponse<Platform>> {
    return this.http.request("PATCH", `${platformPath(platformId)}/enable`);
  }

  /** `PATCH /platforms/{platformId}/webhook-secret`: generates a new secret. */
  refreshWebhookSecret(platformId: string): Promise<ApiResponse<Platform>> {
    return this.http.request(
      "PATCH",
      `${platformPath(platformId)}/webhook-secret`,
    );
  }

  /** `POST /platforms/{platformId}/webhook/dummy`: sends a test webhook. */
  sendTestWebhook(
    platformId: string,
  ): Promise<ApiResponse<WebhookDeliveryResult>> {
    return this.http.request(
      "POST",
      `${platformPath(platformId)}/webhook/dummy`,
    );
  }

  /** `GET /platforms/{platformId}/webhook`: webhooks that failed delivery. */
  listDeadWebhooks(platformId: string): Promise<ApiResponse<DeadWebhook[]>> {
    return this.http.request("GET", `${platformPath(platformId)}/webhook`);
  }

  /** `POST /platforms/{platformId}/webhook/resend`: up to 25 per call. */
  resendDeadWebhooks(
    platformId: string,
  ): Promise<ApiResponse<DeadWebhookResendSummary>> {
    return this.http.request(
      "POST",
      `${platformPath(platformId)}/webhook/resend`,
    );
  }

  /** `POST /platforms/{platformId}/webhook/{webhookId}/resend` */
  resendDeadWebhook(
    platformId: string,
    webhookId: string,
  ): Promise<ApiResponse<DeadWebhookResendResult>> {
    return this.http.request(
      "POST",
      `${platformPath(platformId)}/webhook/${encodeURIComponent(webhookId)}/resend`,
    );
  }

  /** `POST /slant/webhook`: sends a custom webhook to one of your platforms. */
  sendCustomWebhook(payload: WebhookPayload): Promise<ApiResponse<undefined>> {
    return this.http.request("POST", "slant/webhook", { body: payload });
  }

  /** `GET /platforms/stripe/public-key` */
  getStripePublicKey(): Promise<ApiResponse<{ publicKey: string }>> {
    return this.http.request("GET", "platforms/stripe/public-key");
  }
}

function platformPath(platformId: string): string {
  return `platforms/${encodeURIComponent(platformId)}`;
}
