import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { signToken } from "@/lib/tokens";
import type { StorageAdapter, UploadTarget } from "./types";

/**
 * Local disk storage in `.storage/` (outside `public/`, never served statically).
 * Upload/download URLs point at app routes that verify a signed, expiring token.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = "local";
  readonly mode = "MOCK" as const;

  private root(): string {
    return path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || ".storage");
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root(), key);
    if (!full.startsWith(this.root() + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async createUploadUrl({
    key,
    mime,
    maxBytes,
    expiresInSeconds = 600,
  }: {
    key: string;
    mime: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<UploadTarget> {
    const token = signToken("upload", { key, mime, maxBytes }, expiresInSeconds);
    return {
      url: `/api/uploads/local?token=${encodeURIComponent(token)}`,
      method: "PUT",
      headers: { "Content-Type": mime },
      key,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return `/api/files?token=${encodeURIComponent(signToken("download", { key }, expiresInSeconds))}`;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
