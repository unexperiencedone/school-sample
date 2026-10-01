import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ForbiddenError, type Permission, assertCan } from "@/lib/rbac";
import { NotConfiguredError } from "@/integrations/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

/** Consistent error envelope: { error: { code, message, details } } */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details: details ?? null } }, { status });
}

export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError)
    return errorResponse(422, "VALIDATION_FAILED", "Some fields need attention", err.flatten());
  if (err instanceof ForbiddenError) return errorResponse(403, "FORBIDDEN", err.message);
  if (err instanceof NotConfiguredError)
    return errorResponse(503, "NOT_CONFIGURED", err.message, { missing: err.missing });
  if (err instanceof Error && err.message === "UNAUTHENTICATED")
    return errorResponse(401, "UNAUTHENTICATED", "Sign in required");
  console.error(err);
  return errorResponse(500, "INTERNAL", "Something went wrong");
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with error mapping and (optionally) auth + permission checks. */
export function route<P = Record<string, string>>(
  handler: (req: Request, ctx: { params: P; user: CurrentUser | null }) => Promise<Response>,
  opts: { permission?: Permission; auth?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      let user: CurrentUser | null = null;
      if (opts.permission || opts.auth) {
        user = await getCurrentUser();
        if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
        if (opts.permission) assertCan(user.role, opts.permission);
      }
      return await handler(req, { params: await ctx.params, user });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "Request body must be JSON");
  }
  return schema.parse(body);
}

/** Cursor pagination helper over cuid ids. Returns `nextCursor` when more rows exist. */
export function paginate<T extends { id: string }>(
  rows: T[],
  take: number,
): { data: T[]; nextCursor: string | null } {
  const hasMore = rows.length > take;
  const data = hasMore ? rows.slice(0, take) : rows;
  return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
}

export function pageParams(url: URL, max = 100): { take: number; cursor?: string } {
  const take = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), max);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  return { take, cursor };
}
