import { execFileSync } from "node:child_process";

process.env.DATABASE_URL ??=
  "postgresql://trackstacc:trackstacc@localhost:5432/trackstacc";
execFileSync(
  "prisma",
  [...process.argv.slice(2), "--schema", "../../prisma/schema.prisma"],
  { stdio: "inherit" },
);
