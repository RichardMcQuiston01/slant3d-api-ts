import type { HttpClient } from "../http/httpClient.js";
import type {
  ApiResponse,
  Component,
  ComponentCategory,
  CountedResponse,
  Filament,
  FilamentProfile,
  ServiceHealth,
  Stationery,
} from "../types.js";

/** Printable components (inserts, feet, etc.) that can be added to orders. */
export class ComponentsResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /components` */
  list(): Promise<CountedResponse<Component>> {
    return this.http.request("GET", "components");
  }

  /** `GET /components/search` */
  search(searchString: string): Promise<CountedResponse<Component>> {
    return this.http.request("GET", "components/search", {
      query: { searchString },
    });
  }

  /** `GET /components/categories` */
  listCategories(): Promise<CountedResponse<ComponentCategory>> {
    return this.http.request("GET", "components/categories");
  }

  /** `GET /components/{id}` */
  get(id: string): Promise<ApiResponse<Component>> {
    return this.http.request("GET", `components/${encodeURIComponent(id)}`);
  }
}

export interface ListFilamentsQuery {
  /** Material filter. Sent as repeated query keys. */
  profile?: FilamentProfile[];
  /** Color-name filter. Sent as repeated query keys. */
  color?: string[];
}

export interface FilamentListResponse extends CountedResponse<Filament> {
  lastUpdated?: string;
}

/** Available filament materials and colors. */
export class FilamentsResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /filaments` */
  list(query: ListFilamentsQuery = {}): Promise<FilamentListResponse> {
    return this.http.request("GET", "filaments", { query: { ...query } });
  }
}

/** Available stationery products. */
export class StationeryResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /stationery` */
  list(): Promise<CountedResponse<Stationery>> {
    return this.http.request("GET", "stationery");
  }
}

/** System health. */
export class HealthResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /health/status`: map of service name to latest check result. */
  status(): Promise<ApiResponse<Record<string, ServiceHealth>>> {
    return this.http.request("GET", "health/status");
  }
}
