import { Slant3dApiError, Slant3dNetworkError } from "../errors.js";
import type { HttpClient } from "../http/httpClient.js";
import type {
  ApiResponse,
  CountedResponse,
  PaginatedResponse,
  PaginationQuery,
  Slant3dFile,
} from "../types.js";

export type FileSortField = "createdAt" | "updatedAt" | "name" | "type";

export interface FileListOptions extends PaginationQuery {
  /** Max 200 for file endpoints. */
  sortBy?: FileSortField;
  sortOrder?: "ASC" | "DESC";
}

export interface ListFilesQuery extends FileListOptions {
  platformId?: string;
  ownerId?: string;
  publicId?: string;
  /** `YYYY-MM-DD`. */
  startDate?: string;
  endDate?: string;
}

export interface RequestUploadRequest {
  name: string;
  platformId: string;
  ownerId?: string;
}

export interface RequestUploadData {
  /** URL to PUT the file bytes to (1 hour expiry). */
  presignedUrl: string;
  key: string;
  /** Pass this, unmodified, to {@link FilesResource.confirmUpload}. */
  filePlaceholder: Slant3dFile;
}

export interface EstimateOptions {
  /** Defaults to PLA Black. */
  filamentId?: string;
  /** Defaults to 1. */
  quantity?: number;
}

export interface FileEstimate {
  subtotal?: number;
  total?: number;
  pricePerUnit?: number;
  quantity?: number;
  totalMaterial?: number;
  estimatedPrintTime?: number;
  bodyChargeCost?: number;
  oversizeSurcharge?: number;
}

export interface UploadFileRequest extends RequestUploadRequest {
  /** The STL bytes. */
  data: ArrayBuffer | Uint8Array | Blob;
}

/** File upload, lookup, OpenSCAD conversion, and price estimation. */
export class FilesResource {
  constructor(
    private readonly http: HttpClient,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** `GET /files` */
  list(query: ListFilesQuery = {}): Promise<PaginatedResponse<Slant3dFile>> {
    return this.http.request("GET", "files", { query: { ...query } });
  }

  /** `GET /files/owner/{ownerId}` */
  listByOwner(
    ownerId: string,
    query: FileListOptions = {},
  ): Promise<PaginatedResponse<Slant3dFile> & { count: number }> {
    return this.http.request("GET", `files/owner/${encodeURIComponent(ownerId)}`, {
      query: { ...query },
    });
  }

  /** `GET /files/platform/{platformId}` */
  listByPlatform(
    platformId: string,
    query: FileListOptions = {},
  ): Promise<PaginatedResponse<Slant3dFile>> {
    return this.http.request(
      "GET",
      `files/platform/${encodeURIComponent(platformId)}`,
      { query: { ...query } },
    );
  }

  /** `GET /files/{publicFileId}` */
  get(publicFileId: string): Promise<ApiResponse<Slant3dFile>> {
    return this.http.request("GET", `files/${encodeURIComponent(publicFileId)}`);
  }

  /** `POST /files/batch` */
  getMany(publicIds: string[]): Promise<CountedResponse<Slant3dFile>> {
    return this.http.request("POST", "files/batch", { body: { publicIds } });
  }

  /**
   * `PATCH /files/{publicFileId}`: reassign the file to another owner id. The
   * spec allows the file creator or an admin, but a `free` role account was
   * observed getting 403 "Admin access required" for its own file
   * (`Slant3dAuthorizationError`); the spec lists no 403 here.
   */
  updateOwner(
    publicFileId: string,
    ownerId: string,
  ): Promise<ApiResponse<Slant3dFile>> {
    return this.http.request("PATCH", `files/${encodeURIComponent(publicFileId)}`, {
      body: { ownerId },
    });
  }

  /**
   * `DELETE /files/{publicFileId}`. The spec says only the file creator may
   * delete, but accounts with a non-admin role (e.g. `free`) were observed
   * getting 403 "Admin access required" even for their own files, which
   * surfaces as `Slant3dAuthorizationError`.
   */
  delete(publicFileId: string): Promise<ApiResponse<undefined>> {
    return this.http.request("DELETE", `files/${encodeURIComponent(publicFileId)}`);
  }

  /** `POST /files/direct-upload`: step 1 of a manual upload. */
  requestUpload(
    request: RequestUploadRequest,
  ): Promise<ApiResponse<RequestUploadData>> {
    return this.http.request("POST", "files/direct-upload", { body: request });
  }

  /** `POST /files/confirm-upload`: step 3 of a manual upload. */
  confirmUpload(
    filePlaceholder: Slant3dFile,
  ): Promise<ApiResponse<Slant3dFile>> {
    return this.http.request("POST", "files/confirm-upload", {
      body: { filePlaceholder },
    });
  }

  /**
   * Runs the whole upload flow: request a presigned URL, PUT the bytes, and
   * confirm. The file is only valid once confirmed.
   */
  async upload(request: UploadFileRequest): Promise<ApiResponse<Slant3dFile>> {
    const { data, ...uploadRequest } = request;
    const presigned: ApiResponse<RequestUploadData> =
      await this.requestUpload(uploadRequest);
    const { presignedUrl, filePlaceholder } = presigned.data;

    let putResponse: Response;
    try {
      putResponse = await this.fetchImpl(presignedUrl, {
        method: "PUT",
        body: data as RequestInit["body"],
      });
    } catch (cause) {
      throw new Slant3dNetworkError(
        `Upload of "${request.name}" to the presigned URL failed before a response was received`,
        cause,
      );
    }
    if (!putResponse.ok) {
      throw new Slant3dApiError(
        `Upload of "${request.name}" to the presigned URL failed with status ${putResponse.status}`,
        putResponse.status,
        "presigned-upload",
        await putResponse.text(),
      );
    }

    return this.confirmUpload(filePlaceholder);
  }

  /** `POST /files/openScad`: converts OpenSCAD source to STL bytes. */
  convertOpenScad(scadCode: string): Promise<ArrayBuffer> {
    return this.http.request("POST", "files/openScad", {
      body: { scadCode },
      responseType: "arrayBuffer",
    });
  }

  /** `POST /files/{publicFileId}/estimate`: print cost estimate in USD. */
  estimate(
    publicFileId: string,
    options?: EstimateOptions,
  ): Promise<ApiResponse<FileEstimate>> {
    return this.http.request(
      "POST",
      `files/${encodeURIComponent(publicFileId)}/estimate`,
      { body: options !== undefined ? { options } : {} },
    );
  }
}
