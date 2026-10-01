"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";

export async function saveView(module: string, name: string, query: string, path: string) {
  const user = await actionUser("dashboard:view");
  const v = z
    .object({
      module: z.string().max(40),
      name: z.string().trim().min(1).max(60),
      query: z.string().max(1000),
    })
    .parse({ module, name, query });
  await db.savedView.create({ data: { userId: user.id, ...v } });
  revalidatePath(path);
}

export async function deleteView(id: string, path: string) {
  const user = await actionUser("dashboard:view");
  await db.savedView.deleteMany({ where: { id, userId: user.id } });
  revalidatePath(path);
}
