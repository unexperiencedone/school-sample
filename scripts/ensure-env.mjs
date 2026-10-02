// postinstall: gives a fresh clone a working .env (every value in .env.example is a safe local default), so that
// `pnpm i && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev` works with nothing else to set up.
// Skipped on Vercel/CI, where the environment is injected, and when a .env already exists.
import { copyFileSync, existsSync } from "node:fs";

if (!process.env.VERCEL && !process.env.CI && !existsSync(".env") && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example (local demo defaults)");
}
