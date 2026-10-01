import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { processWebhook } from "@/lib/services/payments";
import { PAYMENT_PROVIDERS } from "@/integrations/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook/[provider] — signed gateway webhooks. Reads the RAW body (signatures are over raw bytes),
 * verifies the signature, and applies events idempotently. Always 2xx for duplicates so gateways stop retrying.
 */
export const POST = route<{ provider: string }>(async (req, { params }) => {
  if (!PAYMENT_PROVIDERS.includes(params.provider))
    throw new ApiError(404, "UNKNOWN_PROVIDER", "Unknown provider");
  const raw = await req.text();
  const result = await processWebhook(params.provider, raw, req.headers);
  return NextResponse.json(
    { ok: result.errors.length === 0, ...result },
    { status: result.errors.length ? 500 : 200 },
  );
});
