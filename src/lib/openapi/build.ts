import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Builds the OpenAPI document from the route handlers themselves, so it can't drift: every `src/app/api/**\/route.ts`
 * is read for its exported methods, its doc comment (`/** GET /api/x — what it does *\/`) and its `route(..., {
 * permission | auth })` options. `pnpm api:docs` writes the result; a unit test fails when the committed copy is stale.
 */

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export type Endpoint = {
  method: Method;
  path: string; // OpenAPI style: /api/admin/leads/{id}
  summary: string;
  tag: string;
  access: "public" | "session" | "permission" | "cron" | "signed";
  permission?: string;
  params: string[];
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
}

const VERB: Record<Method, string> = {
  GET: "Read",
  POST: "Create",
  PUT: "Replace",
  PATCH: "Update",
  DELETE: "Delete",
};

/** The doc comment directly above an export, flattened to one line (empty when the export has none). */
function docAbove(src: string, at: number): string {
  const before = src.slice(0, at).trimEnd();
  if (!before.endsWith("*/")) return "";
  const start = before.lastIndexOf("/**");
  if (start < 0) return "";
  return before
    .slice(start + 3, -2)
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Prefers the sentence written for this method (`GET /api/x — what it does`, which may share a comment with other
 * methods); otherwise a plain description from the method and path.
 */
function summaryFor(src: string, at: number, method: Method, apiPath: string): string {
  const doc = docAbove(src, at);
  const own = new RegExp(
    `${method}\\s+/api\\S*\\s*(?:[—–-]\\s*)?([\\s\\S]*?)(?=\\s(?:GET|POST|PUT|PATCH|DELETE)\\s+/api|$)`,
  ).exec(doc)?.[1];
  const text = (own ?? (/^(?:GET|POST|PUT|PATCH|DELETE)\s+\/api/.test(doc) ? "" : doc)).trim();
  const noQuery = text.replace(/^[?&=\w,%-]+\s+(?=[A-Z])/, ""); // a query-string example left at the start
  const clean = noQuery.replace(/^[—–-]\s*/, "").trim();
  if (clean) return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/\.$/, "");
  const resource = apiPath
    .split("/")
    .filter((x) => x && x !== "api" && !x.startsWith("{"))
    .slice(-2)
    .join(" ");
  return `${VERB[method]} ${resource.replace(/-/g, " ")}`;
}

const toOpenApiPath = (file: string, root: string) =>
  "/api" +
  path
    .dirname(path.relative(root, file))
    .split(path.sep)
    .filter((s) => s && s !== ".")
    .map((s) =>
      s.startsWith("[...") ? `{${s.slice(4, -1)}}` : s.startsWith("[") ? `{${s.slice(1, -1)}}` : s,
    )
    .map((s) => `/${s}`)
    .join("");

const TAGS: Record<string, string> = {
  admin: "CRM",
  applicant: "Applicant",
  payments: "Payments",
  registration: "Registration",
  "staff-applications": "Careers",
  cron: "Jobs",
  dev: "Development",
};

export function collectEndpoints(root = path.join(process.cwd(), "src/app/api")): Endpoint[] {
  const out: Endpoint[] = [];
  for (const file of walk(root).sort()) {
    const src = readFileSync(file, "utf8");
    const apiPath = toOpenApiPath(file, root);
    const first = apiPath.split("/")[2] ?? "";
    for (const method of METHODS) {
      const exp = new RegExp(`export (?:const ${method} =|async function ${method}\\b)`).exec(src);
      if (!exp) continue;
      const summary = summaryFor(src, exp.index, method, apiPath);
      // Options belong to this export: everything up to the next export
      const rest = src.slice(exp.index);
      const next = rest.slice(10).search(/\nexport /);
      const body = next === -1 ? rest : rest.slice(0, next + 10);
      const permission = /permission:\s*"([a-z:_]+)"/.exec(body)?.[1];
      const access: Endpoint["access"] = apiPath.startsWith("/api/cron/")
        ? "cron"
        : apiPath.startsWith("/api/payments/webhook/")
          ? "signed"
          : permission
            ? "permission"
            : /auth:\s*true/.test(body) || /actionUser|getCurrentUser|requireRole/.test(body)
              ? "session"
              : "public";
      out.push({
        method,
        path: apiPath,
        summary: summary.charAt(0).toUpperCase() + summary.slice(1).replace(/\.$/, ""),
        tag: TAGS[first] ?? "Public",
        access,
        permission,
        params: [...apiPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!),
      });
    }
  }
  return out.sort(
    (a, b) => a.path.localeCompare(b.path) || METHODS.indexOf(a.method) - METHODS.indexOf(b.method),
  );
}

const ERROR_REF = { $ref: "#/components/schemas/Error" };

export function buildOpenApi(endpoints = collectEndpoints()) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const security =
      e.access === "public"
        ? []
        : e.access === "cron"
          ? [{ cronSecret: [] }]
          : e.access === "signed"
            ? []
            : [{ sessionCookie: [] }];
    (paths[e.path] ??= {})[e.method.toLowerCase()] = {
      summary: e.summary,
      tags: [e.tag],
      ...(e.permission ? { description: `Requires the \`${e.permission}\` permission.` } : {}),
      ...(e.access === "signed"
        ? {
            description:
              "Called by the payment gateway. The body is verified against the provider's signature header.",
          }
        : {}),
      security,
      parameters: e.params.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
      responses: {
        "200": { description: "Success" },
        ...(e.access === "public"
          ? {}
          : {
              "401": { description: "Not signed in", content: { "application/json": { schema: ERROR_REF } } },
            }),
        ...(e.permission
          ? {
              "403": {
                description: "Signed in without the permission",
                content: { "application/json": { schema: ERROR_REF } },
              },
            }
          : {}),
        "422": { description: "Validation failed", content: { "application/json": { schema: ERROR_REF } } },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Aurelia Hall School API",
      version: "0.1.0",
      description:
        "Sample build. Errors use one envelope: `{ error: { code, message, details } }`. Admin endpoints need a staff session and the permission named on each; money is integer paise.",
    },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
        cronSecret: { type: "http", scheme: "bearer", description: "Authorization: Bearer $CRON_SECRET" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
            },
          },
        },
      },
    },
  };
}

/** The endpoint index inserted into docs/API.md between its markers. */
export function endpointTable(endpoints = collectEndpoints()): string {
  const rows = endpoints.map((e) => {
    const who =
      e.access === "permission"
        ? `\`${e.permission}\``
        : {
            public: "public",
            session: "signed in",
            cron: "cron secret",
            signed: "gateway signature",
            permission: "",
          }[e.access];
    return `| \`${e.method}\` | \`${e.path}\` | ${who} | ${e.summary} |`;
  });
  return [
    "| Method | Path | Access | What it does |",
    "| ------ | ---- | ------ | ------------ |",
    ...rows,
  ].join("\n");
}
