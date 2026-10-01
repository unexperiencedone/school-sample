import { createHash, createHmac } from "node:crypto";
import { requireEnv } from "../errors";
import { providerFetch } from "../payments/http";
import type { StorageAdapter, UploadTarget } from "./types";

/**
 * S3 (or S3-compatible: R2, MinIO via S3_ENDPOINT) using SigV4 query-string presigning. No SDK needed.
 * Env: S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional S3_ENDPOINT.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly name = "s3";
  readonly mode = "LIVE" as const;

  private cfg() {
    const [bucket, region, accessKey, secretKey] = requireEnv("S3", [
      "S3_BUCKET",
      "S3_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ]);
    const endpoint = process.env.S3_ENDPOINT || `https://${bucket}.s3.${region}.amazonaws.com`;
    const pathStyle = !!process.env.S3_ENDPOINT;
    return { bucket, region, accessKey, secretKey, endpoint, pathStyle };
  }

  /** AWS SigV4 presigned URL (UNSIGNED-PAYLOAD). */
  presign(method: "GET" | "PUT" | "DELETE", key: string, expiresIn: number, now = new Date()): string {
    const { bucket, region, accessKey, secretKey, endpoint, pathStyle } = this.cfg();
    const url = new URL(endpoint);
    const canonicalUri = `${pathStyle ? `/${bucket}` : ""}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${region}/s3/aws4_request`;
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${accessKey}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k]!)}`)
      .join("&");
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  async createUploadUrl({
    key,
    mime,
    expiresInSeconds = 600,
  }: {
    key: string;
    mime: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<UploadTarget> {
    return {
      url: this.presign("PUT", key, expiresInSeconds),
      method: "PUT",
      headers: { "Content-Type": mime },
      key,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return this.presign("GET", key, expiresInSeconds);
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    await providerFetch("S3", this.presign("PUT", key, 300), {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: new Uint8Array(data),
    });
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(this.presign("GET", key, 300));
    if (!res.ok) throw new Error(`S3 get ${key}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await providerFetch("S3", this.presign("DELETE", key, 300), { method: "DELETE" });
  }
}
