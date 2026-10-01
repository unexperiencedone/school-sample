import { beforeEach, describe, expect, it, vi } from "vitest";

const used = new Set<string>();
vi.mock("@/lib/single-use", () => ({
  consumeToken: async (id: string) => {
    if (used.has(id)) return false;
    used.add(id);
    return true;
  },
}));

import { answerHash, ImageCaptchaAdapter, renderCaptchaSvg } from "@/integrations/captcha/image";
import { signToken } from "@/lib/tokens";

describe("image captcha", () => {
  const adapter = new ImageCaptchaAdapter();
  beforeEach(() => used.clear());

  it("issues an SVG challenge without revealing the answer", async () => {
    const c = await adapter.issue();
    expect(c.image.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(c.token).not.toMatch(/[A-Z2-9]{5}"/);
    expect(renderCaptchaSvg("ABCDE")).toContain(">A<");
  });

  it("verifies the right answer once (case-insensitive) and rejects replays", async () => {
    const token = signToken("captcha", { n: "nonce1", h: answerHash("K7PQR", "nonce1") }, 600);
    expect(await adapter.verify({ token, response: "wrong" })).toBe(false);
    expect(await adapter.verify({ token, response: " k7pqr " })).toBe(true);
    expect(await adapter.verify({ token, response: "K7PQR" })).toBe(false);
  });

  it("rejects expired, forged and missing tokens", async () => {
    expect(
      await adapter.verify({
        token: signToken("captcha", { n: "n2", h: answerHash("AAAAA", "n2") }, -5),
        response: "AAAAA",
      }),
    ).toBe(false);
    expect(
      await adapter.verify({
        token: signToken("upload", { n: "n3", h: answerHash("AAAAA", "n3") }, 600),
        response: "AAAAA",
      }),
    ).toBe(false);
    expect(await adapter.verify({ response: "AAAAA" })).toBe(false);
  });
});
