export type UploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  expiresAt: string;
};

export interface StorageAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  createUploadUrl(input: {
    key: string;
    mime: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<UploadTarget>;
  createDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Whitelist shared by every adapter. */
export const UPLOAD_POLICY = {
  maxBytes: 5 * 1024 * 1024,
  mimes: {
    "application/pdf": [0x25, 0x50, 0x44, 0x46],
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/webp": [0x52, 0x49, 0x46, 0x46],
  } as Record<string, number[]>,
};

export function isAllowedMime(mime: string): boolean {
  return mime in UPLOAD_POLICY.mimes;
}

/** Verifies the file's magic bytes match its declared type (don't trust the extension or Content-Type). */
export function sniffMatches(data: Buffer, mime: string): boolean {
  const magic = UPLOAD_POLICY.mimes[mime];
  return !!magic && magic.every((byte, i) => data[i] === byte);
}

/**
 * Virus-scan hook. Wire ClamAV (clamd INSTREAM) or a cloud scanner here before going live.
 * Returns clean for the demo.
 */
export async function scanForMalware(_data: Buffer): Promise<{ clean: boolean; engine: string }> {
  return { clean: true, engine: "none (placeholder)" };
}

export const STORAGE_ENV: Record<string, string[]> = {
  local: ["STORAGE_LOCAL_DIR"],
  s3: ["S3_BUCKET", "S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
};
