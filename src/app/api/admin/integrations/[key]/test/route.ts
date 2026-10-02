import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { testIntegration } from "@/lib/services/settings-integrations";

const bodySchema = z.object({ phone: z.string().trim().max(30).optional() });

/**
 * POST /api/admin/integrations/[key]/test — runs the adapter's self-test (email goes to the caller's own address;
 * whatsapp and sms need `{ "phone": "+91 …" }`). Returns `{ ok, message, ms }`; a failed test is a 200 with ok false.
 */
export const POST = route<{ key: string }>(
  async (req, { user, params }) => {
    const body = await parseJson(req, bodySchema);
    return NextResponse.json({ data: await testIntegration(user!, params.key, body) });
  },
  { permission: "settings:write" },
);
