/* Prints the RBAC matrix as Markdown (pasted into docs/ARCHITECTURE.md). Usage: pnpm tsx scripts/rbac-matrix.ts */
import { PERMISSIONS, ROLE_PERMISSIONS, SENSITIVE } from "../src/lib/rbac";

const roles = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];
const short: Record<string, string> = {
  SUPER_ADMIN: "SA",
  PRINCIPAL: "PRN",
  ADMISSIONS: "ADM",
  ACCOUNTS: "ACC",
  REGISTRAR: "REG",
  TEACHER: "TCH",
  HOUSEPARENT: "HSP",
  HR: "HR",
  PARENT: "PAR",
  APPLICANT: "APP",
};
const lines = [
  `| Permission | ${roles.map((r) => short[r]).join(" | ")} |`,
  `|---|${roles.map(() => ":-:").join("|")}|`,
];
for (const p of PERMISSIONS) {
  const name = SENSITIVE.includes(p) ? `\`${p}\` ⚠︎` : `\`${p}\``;
  lines.push(`| ${name} | ${roles.map((r) => (ROLE_PERMISSIONS[r].includes(p) ? "●" : "")).join(" | ")} |`);
}
console.log(lines.join("\n"));
