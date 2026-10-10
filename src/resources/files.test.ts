import { describe, expect, it } from "bun:test";
import {
  Slant3dApiError,
  Slant3dConfigError,
  Slant3dTimeoutError,
} from "../errors.js";
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

  describe("upload() presigned URL handling", () => {
    function uploadSetup(presignedUrl: string, putResponse?: () => Response) {
      return setup((call) =>
        call.url.endsWith("/files/direct-upload")
          ? jsonResponse(200, {
              success: true,
              message: "ok",
              data: { presignedUrl, key: "k", filePlaceholder: PLACEHOLDER },
            })
          : (putResponse?.() ?? new Response(null, { status: 200 })),
      );
    }
    const upload = { name: "part.stl", platformId: "p1", data: new Uint8Array([1]) };

    it("refuses a non-https URL without sending the file", async () => {
      const { files, calls } = uploadSetup("http://s3.example.test/upload");
      await expect(files.upload(upload)).rejects.toBeInstanceOf(
        Slant3dConfigError,
      );
      expect(calls).toHaveLength(1);
    });

    it("refuses a URL with embedded credentials", async () => {
      const { files, calls } = uploadSetup("https://u:p@s3.example.test/upload");
      await expect(files.upload(upload)).rejects.toBeInstanceOf(
        Slant3dConfigError,
      );
      expect(calls).toHaveLength(1);
    });

    it("refuses a URL that does not parse", async () => {
      const { files } = uploadSetup("not a url");
      await expect(files.upload(upload)).rejects.toBeInstanceOf(
        Slant3dConfigError,
      );
    });

    it("allows http only when explicitly enabled", async () => {
      const { fetch, calls } = createMockFetch((call) =>
        call.url.endsWith("/files/direct-upload")
          ? jsonResponse(200, {
              success: true,
              message: "ok",
              data: {
                presignedUrl: "http://localhost:9000/upload",
                key: "k",
                filePlaceholder: PLACEHOLDER,
              },
            })
          : jsonResponse(200, { success: true, message: "ok", data: PLACEHOLDER }),
      );
      const files = new FilesResource(
        new HttpClient({
          apiToken: "abc123",
          fetchImpl: fetch,
          allowInsecureUploadUrl: true,
        }),
      );
      await files.upload(upload);
      expect(calls[1]?.url).toBe("http://localhost:9000/upload");
    });

    it("PUTs without redirects and without the API token", async () => {
      const { files, calls } = uploadSetup("https://s3.example.test/upload");
      await files.upload(upload);
      expect(calls[1]?.method).toBe("PUT");
      expect(calls[1]?.redirect).toBe("error");
      expect(calls[1]?.headers.get("authorization")).toBeNull();
    });

    it("caps the storage error body attached to the error", async () => {
      const { files } = uploadSetup(
        "https://s3.example.test/upload",
        () => new Response("x".repeat(50_000), { status: 403 }),
      );
      const error = (await files.upload(upload).catch((e: unknown) => e)) as Slant3dApiError;
      expect(error).toBeInstanceOf(Slant3dApiError);
      expect(String(error.responseBody)).toHaveLength(1024);
    });

    it("times out a PUT that never responds", async () => {
      const files = new FilesResource(
        new HttpClient({
          apiToken: "abc123",
          timeoutMs: 10,
          fetchImpl: (async (input, init) => {
            if (input.toString().endsWith("/files/direct-upload")) {
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
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            });
          }) as typeof fetch,
        }),
      );
      await expect(files.upload(upload)).rejects.toBeInstanceOf(
        Slant3dTimeoutError,
      );
    });
  });

  it("rejects a dot-segment id without making a request", async () => {
    const { files, calls } = setup(() => jsonResponse(200, {}));
    await expect(files.listByOwner("..")).rejects.toBeInstanceOf(
      Slant3dConfigError,
    );
    await expect(files.estimate("..")).rejects.toBeInstanceOf(
      Slant3dConfigError,
    );
    expect(calls).toHaveLength(0);
  });
});
