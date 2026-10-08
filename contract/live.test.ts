/**
 * Live contract tests: call the real Slant3D V2 API and check that responses
 * still match the published OpenAPI spec and that the client parses them.
 *
 * Skipped unless explicitly enabled, so `bun test` and CI stay offline:
 *
 *   SLANT3D_LIVE_TESTS=1                      public + error-path checks
 *   SLANT3D_LIVE_TESTS=1 SLANT3D_API_TOKEN=…  adds read-only authenticated checks
 *   … SLANT3D_LIVE_WRITE=1 SLANT3D_LIVE_PLATFORM_ID=<uuid>
 *                                             adds file upload/estimate/delete
 *
 * Optional: `SLANT3D_SPEC_SOURCE` points at a local spec file or alternate URL.
 * The write checks only create and delete one tiny file on the platform you
 * name. They never create orders, so nothing is printed or charged.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import {
  Slant3dAuthenticationError,
  Slant3dClient,
  Slant3dNotFoundError,
} from "../src/index.js";
import { DEFAULT_SPEC_URL, loadSpec } from "./specOperations.js";
import { SpecResponseValidator } from "./specValidator.js";

const LIVE_ENABLED: boolean = process.env.SLANT3D_LIVE_TESTS === "1";
const API_TOKEN: string | undefined = process.env.SLANT3D_API_TOKEN || undefined;
const WRITE_PLATFORM_ID: string | undefined =
  process.env.SLANT3D_LIVE_WRITE === "1"
    ? process.env.SLANT3D_LIVE_PLATFORM_ID || undefined
    : undefined;
const TIMEOUT_MS: number = 30_000;
const MISSING_UUID: string = "00000000-0000-4000-8000-000000000000";

/** Smallest valid ASCII STL: a single tetrahedron. */
const TETRAHEDRON_STL: string = `solid contract
facet normal 0 0 -1
 outer loop
  vertex 0 0 0
  vertex 10 0 0
  vertex 0 10 0
 endloop
endfacet
facet normal 0 -1 0
 outer loop
  vertex 0 0 0
  vertex 0 0 10
  vertex 10 0 0
 endloop
endfacet
facet normal -1 0 0
 outer loop
  vertex 0 0 0
  vertex 0 10 0
  vertex 0 0 10
 endloop
endfacet
facet normal 1 1 1
 outer loop
  vertex 10 0 0
  vertex 0 0 10
  vertex 0 10 0
 endloop
endfacet
endsolid contract
`;

let validator: SpecResponseValidator;

function expectConforms(operationKey: string, body: unknown): void {
  const result = validator.validate(operationKey, body);
  expect(result.errors, `${operationKey} response vs spec`).toEqual([]);
}

describe.skipIf(!LIVE_ENABLED)("live contract: public and error paths", () => {
  beforeAll(async () => {
    validator = new SpecResponseValidator(
      await loadSpec(process.env.SLANT3D_SPEC_SOURCE ?? DEFAULT_SPEC_URL),
    );
  }, TIMEOUT_MS);

  test(
    "health.status matches the spec without authentication",
    async () => {
      const client = new Slant3dClient({ apiToken: "sl-contract-unused" });
      const response = await client.health.status();
      expectConforms("GET /health/status", response);
      expect(Object.keys(response.data).length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  test(
    "an invalid API key maps to Slant3dAuthenticationError",
    async () => {
      const client = new Slant3dClient({
        apiToken: "sl-contract-invalid-key",
        maxRetries: 0,
      });
      const error: unknown = await client.account.getUsage().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Slant3dAuthenticationError);
    },
    TIMEOUT_MS,
  );
});

describe.skipIf(!LIVE_ENABLED || API_TOKEN === undefined)(
  "live contract: authenticated read-only",
  () => {
    let client: Slant3dClient;

    beforeAll(async () => {
      validator = new SpecResponseValidator(
        await loadSpec(process.env.SLANT3D_SPEC_SOURCE ?? DEFAULT_SPEC_URL),
      );
      client = new Slant3dClient({ apiToken: API_TOKEN });
    }, TIMEOUT_MS);

    test(
      "components list, categories, search and get",
      async () => {
        const list = await client.components.list();
        expectConforms("GET /components", list);
        expectConforms(
          "GET /components/categories",
          await client.components.listCategories(),
        );
        expectConforms("GET /components/search", await client.components.search("a"));
        const first = list.data[0];
        if (first !== undefined) {
          expectConforms("GET /components/{}", await client.components.get(first.id));
        }
      },
      TIMEOUT_MS,
    );

    test(
      "filaments list, unfiltered and filtered by profile",
      async () => {
        expectConforms("GET /filaments", await client.filaments.list());
        const filtered = await client.filaments.list({ profile: ["PLA"] });
        expectConforms("GET /filaments", filtered);
        for (const filament of filtered.data) {
          expect(filament.profile).toBe("PLA");
        }
      },
      TIMEOUT_MS,
    );

    test(
      "stationery list",
      async () => {
        expectConforms("GET /stationery", await client.stationery.list());
      },
      TIMEOUT_MS,
    );

    test(
      "platforms list and get",
      async () => {
        const list = await client.platforms.list();
        expectConforms("GET /platforms", list);
        const first = list.data[0];
        if (first !== undefined) {
          expectConforms(
            "GET /platforms/{}",
            await client.platforms.get(first.id),
          );
        }
      },
      TIMEOUT_MS,
    );

    test(
      "files list honors pagination",
      async () => {
        const page = await client.files.list({ page: 1, limit: 1 });
        expectConforms("GET /files", page);
        expect(page.data.length).toBeLessThanOrEqual(1);
        expect(page.pagination.limit).toBe(1);
        expect(page.pagination.page).toBe(1);
      },
      TIMEOUT_MS,
    );

    test(
      "orders list, search and get",
      async () => {
        const page = await client.orders.list({ limit: 1 });
        expectConforms("GET /orders", page);
        expectConforms("GET /orders/search", await client.orders.search("test"));
        const first = page.data[0];
        if (first !== undefined) {
          expectConforms("GET /orders/{}", await client.orders.get(first.publicId));
        }
      },
      TIMEOUT_MS,
    );

    test(
      "usage and API key listing",
      async () => {
        expectConforms("GET /usage", await client.account.getUsage());
        expectConforms("GET /apiKey", await client.account.listApiKeys());
      },
      TIMEOUT_MS,
    );

    test(
      "a missing file maps to Slant3dNotFoundError",
      async () => {
        const error: unknown = await client.files
          .get(MISSING_UUID)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Slant3dNotFoundError);
      },
      TIMEOUT_MS,
    );

    test(
      "OpenSCAD conversion returns STL bytes",
      async () => {
        const stl: ArrayBuffer = await client.files.convertOpenScad("cube(10);");
        expect(stl.byteLength).toBeGreaterThan(0);
      },
      TIMEOUT_MS,
    );
  },
);

describe.skipIf(
  !LIVE_ENABLED || API_TOKEN === undefined || WRITE_PLATFORM_ID === undefined,
)("live contract: file upload round trip (writes)", () => {
  test(
    "upload, get, estimate, reassign and delete a file",
    async () => {
      validator = new SpecResponseValidator(
        await loadSpec(process.env.SLANT3D_SPEC_SOURCE ?? DEFAULT_SPEC_URL),
      );
      const client = new Slant3dClient({ apiToken: API_TOKEN });
      const platformId = WRITE_PLATFORM_ID as string;

      const uploaded = await client.files.upload({
        name: `contract-test-${Date.now()}.stl`,
        platformId,
        data: new TextEncoder().encode(TETRAHEDRON_STL),
      });
      expectConforms("POST /files/confirm-upload", uploaded);
      const fileId: string = uploaded.data.publicFileServiceId;

      try {
        expectConforms("GET /files/{}", await client.files.get(fileId));
        expectConforms(
          "POST /files/{}/estimate",
          await client.files.estimate(fileId),
        );
        expectConforms(
          "PATCH /files/{}",
          await client.files.updateOwner(fileId, "contract-test-owner"),
        );
      } finally {
        const removed = await client.files.delete(fileId);
        expectConforms("DELETE /files/{}", removed);
      }
    },
    120_000,
  );
});
