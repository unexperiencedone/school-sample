import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => StorageAdapter> = {
  local: () => new LocalStorageAdapter(),
  s3: () => new S3StorageAdapter(),
};

export function getStorage(name = process.env.STORAGE_PROVIDER || "local"): StorageAdapter {
  const f = factories[name];
  if (!f) throw new Error(`Unknown STORAGE_PROVIDER "${name}"`);
  return f();
}
export const STORAGE_PROVIDERS = Object.keys(factories);
