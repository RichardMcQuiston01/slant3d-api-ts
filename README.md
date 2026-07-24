# Slant3D API TypeScript Wrapper

## Overview

Framework agnostic TypeScript based package for interacting with Slant3D's API service.

> **Accuracy note:** this client was built from Slant3D's public marketing
> pages and third-party community documentation, not a verified API
> contract — the official docs are a client-rendered site that couldn't be
> scraped while building v1. Quote/pricing (`client.quotes`) is the
> best-documented endpoint; order creation, tracking, filaments, and
> webhooks are best-guess placeholders. See the `@remarks` notes on each
> type/method in `src/resources/` before relying on them in production.

## Installation

```sh
npm install @richardmcquiston01/slant3d-api-ts
# or
bun add @richardmcquiston01/slant3d-api-ts
```

## Quick Start

```ts
import { Slant3dClient } from "@richardmcquiston01/slant3d-api-ts";

const client = new Slant3dClient({ apiToken: process.env.SLANT3D_API_TOKEN });

const quote = await client.quotes.create({
  fileURL: "https://example.com/model.stl",
});

console.log(quote.data.price);
```

## Support

If this library saved you some reverse-engineering, consider [buying me a coffee](https://www.paypal.com/ncp/payment/VDTESHTRR7684). ☕

## Resources

- <https://www.slant3d.com/slant-3d-printing-api>
- <https://www.slant3dapi.com/documentation/introduction>
- <https://slant3dapi.com/>

## License

MIT

## Copyright

Copyright (c)2026 Richard McQuiston
