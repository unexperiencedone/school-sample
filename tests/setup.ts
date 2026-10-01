import { vi } from "vitest";

// `server-only` throws outside a React Server environment; tests run plain Node.
vi.mock("server-only", () => ({}));

process.env.AUTH_SECRET ??= "test-secret";
process.env.MOCK_WEBHOOK_SECRET ??= "test-mock-secret";
