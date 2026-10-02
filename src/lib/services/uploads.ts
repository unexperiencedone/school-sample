import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { signToken } from "@/lib/tokens";
import {
  getStorage,
  isAllowedMime,
  scanForMalware,
  sniffMatches,
  UPLOAD_POLICY,
} from "@/integrations/storage";

/**
 * Signed-URL upload flow:
 *  1. createUpload()   — validates type/size, records a PENDING Upload, returns a short-lived signed PUT target
 *  2. client PUTs the file to that URL (local adapter: /api/uploads/local; S3: presigned URL)
 *  3. completeUpload() — sniffs magic bytes, virus-scan hook, marks STORED and attaches it to its owner
 */
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function createUpload(input: {
  ownerType: "application" | "staff-application" | "student";
  ownerId: string;
  slot: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  if (!isAllowedMime(input.mime))
    throw new ApiError(422, "BAD_TYPE", "Upload a PDF, JPG, PNG or WebP file.", {
      fieldErrors: { [input.slot]: ["Unsupported file type"] },
    });
  if (input.size > UPLOAD_POLICY.maxBytes)
    throw new ApiError(422, "TOO_LARGE", "Files must be 5 MB or smaller.", {
      fieldErrors: { [input.slot]: ["File is larger than 5 MB"] },
    });
  const key = `${input.ownerType}/${input.ownerId}/${input.slot.toLowerCase()}-${randomBytes(6).toString("hex")}.${EXT[input.mime]}`;
  await db.upload.create({
    data: {
      key,
      fileName: input.fileName.slice(0, 200),
      mime: input.mime,
      size: input.size,
      ownerType: input.ownerType,
      ownerId: `${input.ownerId}:${input.slot}`,
      status: "PENDING",
    },
  });
  const storage = getStorage();
  const target = await storage.createUploadUrl({
    key,
    mime: input.mime,
    maxBytes: Math.min(input.size, UPLOAD_POLICY.maxBytes),
  });
  // A direct-to-store upload never passes through this server, so the client reports back and we validate it then
  if (storage.mode === "LIVE")
    target.completeUrl = `/api/uploads/complete?token=${encodeURIComponent(signToken("upload-complete", { key }, 900))}`;
  return target;
}

/** Local adapter: the server received the bytes, so validate them and store them. */
export function completeUpload(key: string, data: Buffer) {
  return finalizeUpload(key, data, false);
}

/** Direct-to-store adapters (S3): the file is already in the bucket; fetch it back and validate it. */
export async function completeStoredUpload(key: string) {
  const data = await getStorage()
    .get(key)
    .catch(() => null);
  if (!data) throw new ApiError(404, "NOT_UPLOADED", "The file hasn't arrived yet. Try the upload again.");
  return finalizeUpload(key, data, true);
}

/** Validates the bytes and attaches the file to its owner record; a rejected file is also removed from the store. */
async function finalizeUpload(key: string, data: Buffer, alreadyStored: boolean) {
  const upload = await db.upload.findUnique({ where: { key } });
  if (!upload || upload.status !== "PENDING")
    throw new ApiError(404, "UNKNOWN_UPLOAD", "Upload not found or already completed");
  const reject = async (status: number, code: string, message: string): Promise<never> => {
    await db.upload.update({ where: { key }, data: { status: "REJECTED" } });
    if (alreadyStored)
      await getStorage()
        .delete(key)
        .catch(() => undefined);
    throw new ApiError(status, code, message);
  };
  if (data.length === 0 || data.length > UPLOAD_POLICY.maxBytes)
    return reject(422, "BAD_SIZE", "Empty or oversized file");
  if (!sniffMatches(data, upload.mime))
    return reject(422, "TYPE_MISMATCH", "The file contents don't match its type.");
  const scan = await scanForMalware(data);
  if (!scan.clean) return reject(422, "INFECTED", "The file failed a security scan.");
  if (!alreadyStored) await getStorage().put(key, data, upload.mime);
  await db.upload.update({ where: { key }, data: { status: "STORED", size: data.length } });

  const [ownerId, slot] = upload.ownerId.split(":");
  if (upload.ownerType === "application" && ownerId && slot) {
    await db.applicationDocument.upsert({
      where: { applicationId_kind: { applicationId: ownerId, kind: slot } },
      create: {
        applicationId: ownerId,
        kind: slot,
        fileKey: key,
        fileName: upload.fileName,
        mime: upload.mime,
        size: data.length,
      },
      update: {
        fileKey: key,
        fileName: upload.fileName,
        mime: upload.mime,
        size: data.length,
        status: "PENDING",
        note: null,
        verifiedAt: null,
        verifiedById: null,
      },
    });
  }
  return { key, fileName: upload.fileName, size: data.length };
}

export async function downloadUrlFor(key: string) {
  return getStorage().createDownloadUrl(key);
}
