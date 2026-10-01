import "server-only";
import { db } from "@/lib/db";

export function listViews(userId: string, module: string) {
  return db.savedView.findMany({
    where: { userId, module },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, query: true },
  });
}
