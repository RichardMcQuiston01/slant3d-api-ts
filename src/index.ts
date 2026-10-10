export { Slant3dClient } from "./client.js";
export type { Slant3dClientOptions } from "./client.js";

export {
  Slant3dApiError,
  Slant3dAuthenticationError,
  Slant3dAuthorizationError,
  Slant3dConfigError,
  Slant3dError,
  Slant3dNetworkError,
  Slant3dNotFoundError,
  Slant3dRateLimitError,
  Slant3dResponseTooLargeError,
  Slant3dTimeoutError,
  Slant3dValidationError,
  Slant3dWebhookError,
} from "./errors.js";

export type * from "./types.js";

export type {
  CreateOrderItem,
  CreateOrderRequest,
  ListOrdersQuery,
  OrderData,
} from "./resources/orders.js";
export type {
  EstimateOptions,
  FileEstimate,
  FileListOptions,
  FileSortField,
  ListFilesQuery,
  RequestUploadData,
  RequestUploadRequest,
  UploadFileRequest,
} from "./resources/files.js";
export type {
  CreatePlatformRequest,
  DeadWebhook,
  DeadWebhookResendResult,
  DeadWebhookResendSummary,
  DeadWebhookStatus,
  UpdatePlatformRequest,
  WebhookDeliveryResult,
} from "./resources/platforms.js";
export type {
  FilamentListResponse,
  ListFilamentsQuery,
} from "./resources/catalog.js";

export type * from "./webhooks/types.js";
export {
  constructWebhookEvent,
  DEFAULT_WEBHOOK_TOLERANCE_MS,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "./webhooks/verify.js";
export type {
  ConstructWebhookEventOptions,
  VerifyWebhookOptions,
  WebhookVerificationResult,
} from "./webhooks/verify.js";
