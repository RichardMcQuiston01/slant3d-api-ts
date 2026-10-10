import { describe, expect, it } from "bun:test";
import { HttpClient } from "../http/httpClient.js";
import { createMockFetch, jsonResponse } from "../testing/mockFetch.js";
import { ComponentsResource, FilamentsResource } from "./catalog.js";

function setup() {
  const { fetch, calls } = createMockFetch(() => jsonResponse(200, {}));
  const http = new HttpClient({ apiToken: "abc123", fetchImpl: fetch });
  return {
    components: new ComponentsResource(http),
    filaments: new FilamentsResource(http),
    calls,
  };
}

describe("catalog resources", () => {
  it("filters filaments with repeated profile/color keys", async () => {
    const { filaments, calls } = setup();
    await filaments.list({ profile: ["PLA", "PETG"], color: ["matte black"] });
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/filaments?profile=PLA&profile=PETG&color=matte+black",
    );
  });

  it("searches components with searchString", async () => {
    const { components, calls } = setup();
    await components.search("m3");
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/components/search?searchString=m3",
    );
  });

  it("gets component categories", async () => {
    const { components, calls } = setup();
    await components.listCategories();
    expect(calls[0]?.url).toBe(
      "https://slant3dapi.com/v2/api/components/categories",
    );
  });
});
