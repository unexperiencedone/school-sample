import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApi, collectEndpoints, endpointTable } from "@/lib/openapi/build";

describe("OpenAPI document", () => {
  it("is up to date with the route handlers (run `pnpm api:docs`)", () => {
    const committed = JSON.parse(readFileSync("src/lib/openapi/openapi.json", "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });

  it("keeps the endpoint index in docs/API.md in sync", () => {
    // Prettier pads Markdown tables, so compare with whitespace squeezed
    const squeeze = (t: string) => t.replace(/[ \t]+/g, " ").replace(/-{2,}/g, "-");
    expect(squeeze(readFileSync("docs/API.md", "utf8"))).toContain(squeeze(endpointTable()));
  });

  it("describes access correctly for the sensitive routes", () => {
    const by = new Map(collectEndpoints().map((e) => [`${e.method} ${e.path}`, e]));
    expect(by.get("GET /api/admin/leads")?.permission).toBe("leads:read");
    expect(by.get("POST /api/cron/{job}")?.access).toBe("cron");
    expect(by.get("POST /api/payments/webhook/{provider}")?.access).toBe("signed");
    expect(by.get("POST /api/leads")?.access).toBe("public");
    // every admin endpoint is permissioned or at least needs a session
    for (const e of collectEndpoints().filter((x) => x.path.startsWith("/api/admin/")))
      expect(e.access, `${e.method} ${e.path}`).not.toBe("public");
  });
});
