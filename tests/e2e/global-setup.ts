import { execSync } from "node:child_process";

/**
 * Every e2e run starts from the same deterministic demo data, so tests that pay, approve or withdraw can run
 * again and again. Set E2E_SKIP_SEED=1 to reuse the current database (faster when iterating on one spec).
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED === "1") return;
  execSync("pnpm -s db:seed", { stdio: "inherit", timeout: 300_000 });
}
