# Slant3D API TypeScript Wrapper

## Overview

Framework agnostic TypeScript client for the [Slant3D V2 API](https://slant3dapi.com/documentation/introduction).
Types follow the official OpenAPI spec, published at
`https://slant3dapi.com/v2/api/openapi.json`. Zero runtime dependencies;
uses the platform `fetch` and Web Crypto (Node 18+, Bun, Deno, edge).

> Response and request property names match the wire format exactly, which
> mixes camelCase and snake_case (e.g. `public_ids`, `event_type`).

## Installation

```sh
npm install @richardmcquiston01/slant3d-api-ts
# or
bun add @richardmcquiston01/slant3d-api-ts
```

## Quick Start

Order workflow: upload files, create a draft order, then process it.
Status changes arrive by webhook.

```ts
import { readFile } from "node:fs/promises";
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

// Reads SLANT3D_API_TOKEN when apiToken is omitted.
const client = new Slant3dClient({ apiToken: process.env.SLANT3D_API_TOKEN });

const platformId = "your-platform-id"; // see client.platforms.list()

// 1. Upload (presigned URL + PUT + confirm in one call)
const file = await client.files.upload({
  name: "part.stl",
  platformId,
  data: await readFile("part.stl"),
});
const publicFileServiceId = file.data.publicFileServiceId;

// Optional: price estimate
const estimate = await client.files.estimate(publicFileServiceId, {
  quantity: 2,
});
console.log(estimate.data.total);

// 2. Draft order (nothing charged yet)
const draft = await client.orders.createDraft({
  platformId,
  customer: {
    details: {
      email: "ada@example.com",
      address: {
        name: "Ada Lovelace",
        line1: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
    },
  },
  items: [{ type: "PRINT", publicFileServiceId, quantity: 2 }],
});

// 3. Process: charges payment and starts production
const order = await client.orders.process(draft.data.order.publicId);
```

### Resources

| Client property       | Endpoints                                                              |
| --------------------- | ---------------------------------------------------------------------- |
| `client.files`        | list, get, batch, upload, delete, estimate, OpenSCAD to STL            |
| `client.orders`       | list, search, get, batch, createDraft, process, cancel                 |
| `client.platforms`    | CRUD, enable/disable, webhook secret, test/dead webhooks, Stripe key   |
| `client.components`   | list, search, categories, get                                          |
| `client.filaments`    | list (filter by `profile` / `color`)                                   |
| `client.stationery`   | list                                                                   |
| `client.account`      | usage, API keys                                                        |
| `client.health`       | service health                                                         |

Every method returns the API's `{ success, message, data }` envelope, plus
`count` or `pagination` where the endpoint provides them.

### Error handling

Non-2xx responses throw typed errors, all extending `Slant3dApiError`
(`.status`, `.requestPath`, `.responseBody`):

```ts
import {
  Slant3dNotFoundError,
  Slant3dRateLimitError,
} from "@richardmcquiston01/slant3d-api-ts";

try {
  await client.orders.get("SLANT_0000000000");
} catch (error) {
  if (error instanceof Slant3dNotFoundError) {
    /* ... */
  } else if (error instanceof Slant3dRateLimitError) {
    console.log(`retry in ${error.retryAfterMs}ms`);
  } else {
    throw error;
  }
}
```

Network and timeout failures throw `Slant3dNetworkError` /
`Slant3dTimeoutError`. The API allows 100 requests per minute.

### Retries

`GET` requests are retried (default 2 times, exponential backoff, honoring
`Retry-After`) on network errors, timeouts, 429 and 500/502/503/504.
Non-`GET` requests are **never** retried, since creating and processing
orders is not idempotent. Tune with `maxRetries` / `retryBaseDelayMs`.

### Webhooks

Verify and parse a webhook with the platform's `webhookSecret`. Pass the
**raw** request body, not re-serialized JSON:

```ts
import { constructWebhookEvent } from "@richardmcquiston01/slant3d-api-ts";

// e.g. an Express handler using express.raw({ type: "application/json" })
const event = await constructWebhookEvent({
  payload: req.body.toString(),
  headers: req.headers,
  secret: process.env.SLANT3D_WEBHOOK_SECRET!,
});

if (event.event_type === "order.shipped") {
  console.log(event.data.order.tracking_number);
}
```

Signatures are HMAC-SHA256 over `"<timestamp>.<body>"`, checked in constant
time, and webhooks older than 5 minutes are rejected. Use
`verifyWebhookSignature` directly if you want a result object instead of an
exception.

## Support

If this library saved you some reverse-engineering, consider [buying me a coffee](https://www.paypal.com/ncp/payment/VDTESHTRR7684). ☕

## Resources

- <https://www.slant3d.com/slant-3d-printing-api>
- <https://www.slant3dapi.com/documentation/introduction>
- <https://slant3dapi.com/v2/api/openapi.json>

## License

MIT

## Copyright

Copyright (c)2026 Richard McQuiston
