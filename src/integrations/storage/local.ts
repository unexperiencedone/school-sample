import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { signToken } from "@/lib/tokens";
import type { StorageAdapter, UploadTarget } from "./types";

/**
 * Local disk storage in `.storage/` (outside `public/`, never served statically).
 * Upload/download URLs point at app routes that verify a signed, expiring token.
 *
 * On Vercel the project folder is read-only, so files go to `/tmp` (per instance, not durable — fine for the
 * demo; set STORAGE_PROVIDER=s3 for real use). Documents written by the seed at build time don't exist at
 * runtime there, so a missing seeded PDF is served as a blank placeholder rather than an error.
 */
const PLACEHOLDER_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = "local";
  readonly mode = "MOCK" as const;

  private root(): string {
    if (process.env.STORAGE_LOCAL_DIR) return path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR);
    return process.env.VERCEL ? "/tmp/aurelia-storage" : path.resolve(process.cwd(), ".storage");
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
    try {
      return await readFile(this.resolve(key));
    } catch (e) {
      if (process.env.VERCEL && key.endsWith(".pdf") && (e as NodeJS.ErrnoException).code === "ENOENT")
        return PLACEHOLDER_PDF;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
