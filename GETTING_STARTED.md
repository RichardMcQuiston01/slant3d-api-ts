# Getting Started

This guide shows how to install the package, send your first request, and
handle the most common jobs. Jump to [Examples](#examples) if you want
copy-and-paste code.

## Installation

```sh
npm install @richardmcquiston01/slant3d-api-ts
# or
bun add @richardmcquiston01/slant3d-api-ts
```

Requires Node.js 18 or newer (or Bun, Deno, or another runtime with `fetch`
and Web Crypto).

## Authentication

Create a Slant 3D API key and pass it to the client. If you leave out
`apiToken`, the client reads the `SLANT3D_API_TOKEN` environment variable.

```ts
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient({ apiToken: process.env.SLANT3D_API_TOKEN });
```

Keep your key out of source control. `.env.example` shows the variable name.

## Quick Start

The order workflow is: upload files, create a draft order, then process it.
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

> Property names match the API exactly, which mixes camelCase and snake_case
> (for example `public_ids` and `event_type`).

## What's in the client

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
`count` or `pagination` where the endpoint provides them. The types follow the
official OpenAPI spec at `https://slant3dapi.com/v2/api/openapi.json`.

## Error handling

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

## Retries

`GET` requests are retried (default 2 times, exponential backoff, honoring
`Retry-After`) on network errors, timeouts, 429 and 500/502/503/504.
Non-`GET` requests are **never** retried, since creating and processing
orders is not idempotent. Tune with `maxRetries` / `retryBaseDelayMs`.

## Webhooks

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

## Examples

Each example assumes a `client` created as shown in
[Authentication](#authentication).

### 1. Upload a model and get a price

```ts
import { readFile } from "node:fs/promises";
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient();
const platformId: string = "your-platform-id";

const file = await client.files.upload({
  name: "bracket.stl",
  platformId,
  data: await readFile("bracket.stl"),
});

const estimate = await client.files.estimate(file.data.publicFileServiceId, {
  quantity: 10,
});

console.log(`Total for 10: $${estimate.data.total}`);
console.log(`Each: $${estimate.data.pricePerUnit}`);
```

### 2. Place an order

Creating a draft costs nothing. Processing it charges payment and starts
production, so only call `process` when you are ready.

```ts
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient();

const draft = await client.orders.createDraft({
  platformId: "your-platform-id",
  ownerId: "user-42", // your own id for this customer
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
  items: [
    { type: "PRINT", publicFileServiceId: "file-id", quantity: 10 },
  ],
});

const { publicId, printingCost, deliveryCost } = draft.data.order;
console.log(`Order ${publicId}: print $${printingCost}, shipping $${deliveryCost}`);

// Show the costs to your customer, then:
const processed = await client.orders.process(publicId);
console.log(processed.data.order.status);
```

### 3. Check on an order

```ts
import {
  Slant3dClient,
  Slant3dNotFoundError,
} from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient();

try {
  const result = await client.orders.get("SLANT_0123456789");
  const order = result.data.order;
  console.log(`Status: ${order.status}`);
  console.log(order.fulfillment); // shipping and tracking details
} catch (error) {
  if (error instanceof Slant3dNotFoundError) {
    console.log("No order with that id.");
  } else {
    throw error;
  }
}

// Or list everything that has shipped, 25 per page:
const shipped = await client.orders.list({ status: "SHIPPED", limit: 25 });
console.log(`${shipped.count} shipped orders`);
```

### 4. React to webhooks

This handler uses the standard `Request` and `Response` objects, so it works
in Bun, Deno, Cloudflare Workers, and Next.js route handlers.

```ts
import {
  constructWebhookEvent,
  Slant3dWebhookError,
} from "@richardmcquiston01/slant3d-api-ts";

export async function handleSlantWebhook(request: Request): Promise<Response> {
  const rawBody: string = await request.text(); // raw, not parsed JSON

  try {
    const event = await constructWebhookEvent({
      payload: rawBody,
      headers: request.headers,
      secret: process.env.SLANT3D_WEBHOOK_SECRET ?? "",
    });

    if (event.event_type === "order.shipped") {
      const { public_id, tracking_number } = event.data.order;
      console.log(`${public_id} shipped. Tracking: ${tracking_number}`);
    }
    return new Response("ok");
  } catch (error) {
    if (error instanceof Slant3dWebhookError) {
      return new Response(error.message, { status: 401 });
    }
    throw error;
  }
}
```

Before going live, use `client.platforms.sendTestWebhook(platformId)` to send
yourself a test event.

### 5. Choose a material and add parts

```ts
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient();

// Find available black PLA filaments.
const filaments = await client.filaments.list({
  profile: ["PLA"],
  color: ["black"],
});
const filament = filaments.data.find((item) => item.available !== false);

// Search for a component, such as a threaded insert.
const components = await client.components.search("insert");
const component = components.data[0];

if (filament && component) {
  const draft = await client.orders.createDraft({
    platformId: "your-platform-id",
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
    items: [
      {
        type: "PRINT",
        publicFileServiceId: "file-id",
        filamentId: filament.publicId,
        quantity: 1,
      },
      { type: "COMPONENT", componentId: component.id, quantity: 4 },
    ],
  });
  console.log(draft.data.order.publicId);
}
```
