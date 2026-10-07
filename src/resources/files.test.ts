import { describe, expect, it } from "bun:test";
import { Slant3dApiError } from "../errors.js";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { FilesResource } from "./files.js";

const PLACEHOLDER = {
  publicFileServiceId: "f1",
  name: "part.stl",
  platformId: "p1",
  type: "stl" as const,
};

function setup(handler: Parameters<typeof createMockFetch>[0]) {
  const { fetch, calls } = createMockFetch(handler);
  const files = new FilesResource(
    new HttpClient({ apiToken: "abc123", fetchImpl: fetch }),
    fetch,
  );
  return { files, calls };
}

describe("FilesResource", () => {
  it("estimates with optional options wrapped under `options`", async () => {
    const { files, calls } = setup(() =>
      jsonResponse(200, { success: true, message: "ok", data: { total: 4.5 } }),
    );
    await files.estimate("f1", { quantity: 3 });
    expect(calls[0]?.url).toBe("https://slant3dapi.com/v2/api/files/f1/estimate");
    expect(calls[0]?.body).toEqual({ options: { quantity: 3 } });
  });

  it("converts OpenSCAD to STL bytes", async () => {
    const { files, calls } = setup(() => new Response(new Uint8Array([9, 8])));
    const stl = await files.convertOpenScad("cube(10);");
    expect(calls[0]?.body).toEqual({ scadCode: "cube(10);" });
    expect(new Uint8Array(stl)).toEqual(new Uint8Array([9, 8]));
  });

  it("upload() requests a URL, PUTs the bytes, then confirms", async () => {
    const { files, calls } = setup((call) => {
      if (call.url.endsWith("/files/direct-upload")) {
        return jsonResponse(200, {
          success: true,
          message: "ok",
          data: {
            presignedUrl: "https://s3.example.test/upload",
            key: "k",
            filePlaceholder: PLACEHOLDER,
          },
        });
      }
      if (call.url === "https://s3.example.test/upload") {
        return new Response(null, { status: 200 });
      }
      return jsonResponse(200, {
        success: true,
        message: "ok",
        data: PLACEHOLDER,
      });
    });

    const result = await files.upload({
      name: "part.stl",
      platformId: "p1",
      data: new Uint8Array([1, 2, 3]),
    });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://slant3dapi.com/v2/api/files/direct-upload",
      "PUT https://s3.example.test/upload",
      "POST https://slant3dapi.com/v2/api/files/confirm-upload",
    ]);
    expect(calls[0]?.body).toEqual({ name: "part.stl", platformId: "p1" });
    expect(calls[2]?.body).toEqual({ filePlaceholder: PLACEHOLDER });
    expect(result.data.publicFileServiceId).toBe("f1");
  });

  it("upload() does not confirm when the presigned PUT fails", async () => {
    const { files, calls } = setup((call) =>
      call.url.endsWith("/files/direct-upload")
        ? jsonResponse(200, {
            success: true,
            message: "ok",
            data: {
              presignedUrl: "https://s3.example.test/upload",
              key: "k",
              filePlaceholder: PLACEHOLDER,
            },
          })
        : new Response("denied", { status: 403 }),
    );

    await expect(
      files.upload({ name: "part.stl", platformId: "p1", data: new Uint8Array() }),
    ).rejects.toBeInstanceOf(Slant3dApiError);
    expect(calls).toHaveLength(2);
  });

  it("lists by platform with sort options", async () => {
    const { files, calls } = setup(() => jsonResponse(200, {}));
    await files.listByPlatform("p1", { sortBy: "name", sortOrder: "ASC" });
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/files/platform/p1?sortBy=name&sortOrder=ASC",
    );
  });
});
