import { Slant3dClient } from "../src/client.js";
import { createMockFetch, jsonResponse } from "../src/testing/mockFetch.js";
import type { Slant3dFile } from "../src/types.js";
import { operationKey } from "./specOperations.js";

/** Stand-in for every id argument; swapped for `{}` when building the key. */
const ID: string = "SENTINEL_ID";
const BASE_PATH: string = "/v2/api";

type Invocation = (client: Slant3dClient) => Promise<unknown>;

/**
 * Exercises every public client method once, so the HTTP operations the
 * client performs can be compared to the OpenAPI spec without a network.
 * `contract/clientOperations.test.ts` fails when a method is missing here.
 *
 * Query/body arguments are filled with every option the method supports so
 * the diff can flag names the spec does not know about.
 */
export const INVOCATIONS: Readonly<Record<string, Invocation>> = {
  "files.list": (client) =>
    client.files.list({
      platformId: ID,
      ownerId: ID,
      publicId: ID,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "ASC",
    }),
  "files.listByOwner": (client) =>
    client.files.listByOwner(ID, {
      page: 1,
      limit: 10,
      sortBy: "name",
      sortOrder: "DESC",
    }),
  "files.listByPlatform": (client) =>
    client.files.listByPlatform(ID, {
      page: 1,
      limit: 10,
      sortBy: "name",
      sortOrder: "DESC",
    }),
  "files.get": (client) => client.files.get(ID),
  "files.getMany": (client) => client.files.getMany([ID]),
  "files.updateOwner": (client) => client.files.updateOwner(ID, "owner"),
  "files.delete": (client) => client.files.delete(ID),
  "files.requestUpload": (client) =>
    client.files.requestUpload({ name: "a.stl", platformId: ID, ownerId: ID }),
  "files.confirmUpload": (client) =>
    client.files.confirmUpload({} as Slant3dFile),
  "files.convertOpenScad": (client) =>
    client.files.convertOpenScad("cube(10);"),
  "files.estimate": (client) =>
    client.files.estimate(ID, { filamentId: ID, quantity: 1 }),

  "orders.list": (client) =>
    client.orders.list({
      platformId: ID,
      ownerId: ID,
      status: "DRAFT",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      page: 1,
      limit: 10,
    }),
  "orders.search": (client) => client.orders.search("term"),
  "orders.get": (client) => client.orders.get(ID),
  "orders.getMany": (client) => client.orders.getMany([ID]),
  "orders.createDraft": (client) =>
    client.orders.createDraft({
      platformId: ID,
      ownerId: ID,
      customer: {
        details: {
          email: "contract@example.com",
          address: {
            name: "Contract Test",
            line1: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
          },
        },
        publicPaymentServiceId: ID,
      },
      items: [
        {
          type: "PRINT",
          quantity: 1,
          publicFileServiceId: ID,
          filamentId: ID,
        },
      ],
    }),
  "orders.process": (client) => client.orders.process(ID),
  "orders.cancel": (client) => client.orders.cancel(ID),

  "platforms.list": (client) => client.platforms.list(),
  "platforms.create": (client) =>
    client.platforms.create({
      name: "Contract",
      url: "https://example.com",
      description: "d",
      webhookURL: "https://example.com/hook",
    }),
  "platforms.get": (client) => client.platforms.get(ID),
  "platforms.update": (client) =>
    client.platforms.update(ID, {
      name: "n",
      description: "d",
      url: "https://example.com",
      webhookURL: "https://example.com/hook",
      webhookSecret: "x".repeat(32),
    }),
  "platforms.disable": (client) => client.platforms.disable(ID),
  "platforms.enable": (client) => client.platforms.enable(ID),
  "platforms.refreshWebhookSecret": (client) =>
    client.platforms.refreshWebhookSecret(ID),
  "platforms.sendTestWebhook": (client) => client.platforms.sendTestWebhook(ID),
  "platforms.listDeadWebhooks": (client) => client.platforms.listDeadWebhooks(ID),
  "platforms.resendDeadWebhooks": (client) =>
    client.platforms.resendDeadWebhooks(ID),
  "platforms.resendDeadWebhook": (client) =>
    client.platforms.resendDeadWebhook(ID, ID),
  "platforms.sendCustomWebhook": (client) =>
    client.platforms.sendCustomWebhook({
      event_type: "order.updated",
      service: "order-service",
      platform_id: ID,
      timestamp: "0",
      data: { order: { public_id: ID, status: "PROCESSING" } },
    }),
  "platforms.getStripePublicKey": (client) =>
    client.platforms.getStripePublicKey(),

  "components.list": (client) => client.components.list(),
  "components.search": (client) => client.components.search("foot"),
  "components.listCategories": (client) => client.components.listCategories(),
  "components.get": (client) => client.components.get(ID),
  "filaments.list": (client) =>
    client.filaments.list({ profile: ["PLA", "PETG"], color: ["black"] }),
  "stationery.list": (client) => client.stationery.list(),
  "account.getUsage": (client) => client.account.getUsage(),
  "account.listApiKeys": (client) => client.account.listApiKeys(),
  "account.createApiKey": (client) => client.account.createApiKey("contract"),
  "health.status": (client) => client.health.status(),
};

/**
 * Methods that only compose other methods and make no unique HTTP call, so
 * they have no entry in {@link INVOCATIONS}.
 */
export const COMPOSITE_METHODS: ReadonlySet<string> = new Set(["files.upload"]);

export interface ClientCall {
  /** Name of the client method, e.g. `files.list`. */
  method: string;
  /** `METHOD /normalized/{}` key matching {@link SpecOperation.key}. */
  key: string;
  queryKeys: readonly string[];
  bodyKeys: readonly string[];
}

/** Runs every invocation against a recording mock and returns the calls. */
export async function collectClientCalls(): Promise<ClientCall[]> {
  const calls: ClientCall[] = [];
  const { fetch: mockFetch, calls: recorded } = createMockFetch(() =>
    jsonResponse(200, { success: true, data: {} }),
  );
  const client = new Slant3dClient({
    apiToken: "contract-test-token",
    fetch: mockFetch,
    maxRetries: 0,
  });

  for (const [method, invoke] of Object.entries(INVOCATIONS)) {
    const before: number = recorded.length;
    try {
      await invoke(client);
    } catch (cause) {
      throw new Error(`Invocation "${method}" threw against the mock: ${String(cause)}`);
    }
    const made = recorded.slice(before);
    if (made.length !== 1 || made[0] === undefined) {
      throw new Error(
        `Invocation "${method}" made ${made.length} HTTP calls; expected exactly 1`,
      );
    }
    const call = made[0];
    const url = new URL(call.url);
    const path: string = url.pathname
      .slice(url.pathname.indexOf(BASE_PATH) + BASE_PATH.length)
      .split("/")
      .map((segment: string) => (segment === ID ? "{}" : segment))
      .join("/");
    const body: unknown = call.body;
    calls.push({
      method,
      key: operationKey(call.method, path),
      queryKeys: [...new Set(url.searchParams.keys())],
      bodyKeys:
        typeof body === "object" && body !== null && !Array.isArray(body)
          ? Object.keys(body)
          : [],
    });
  }
  return calls;
}
