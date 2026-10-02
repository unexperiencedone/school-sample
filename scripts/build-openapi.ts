// Regenerates src/lib/openapi/openapi.json and the endpoint index in docs/API.md from the route handlers.
import { readFileSync, writeFileSync } from "node:fs";
import { buildOpenApi, endpointTable } from "../src/lib/openapi/build";

writeFileSync("src/lib/openapi/openapi.json", JSON.stringify(buildOpenApi(), null, 2) + "\n");

const START = "<!-- endpoints:start -->";
const END = "<!-- endpoints:end -->";
const doc = readFileSync("docs/API.md", "utf8");
const a = doc.indexOf(START);
const b = doc.indexOf(END);
if (a < 0 || b < 0) throw new Error("docs/API.md is missing the endpoint markers");
writeFileSync("docs/API.md", `${doc.slice(0, a + START.length)}\n\n${endpointTable()}\n\n${doc.slice(b)}`);
console.log("Wrote src/lib/openapi/openapi.json and docs/API.md");
