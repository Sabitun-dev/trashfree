// Netlify build: generate Prisma client, run migrations ONLY in production, build the Mini App.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const context = process.env.CONTEXT || "local";

run("npx prisma generate");
if (context === "production") {
  console.log("CONTEXT=production → applying database migrations");
  run("npx prisma migrate deploy");
} else {
  console.log(`CONTEXT=${context} → skipping migrations`);
}
run("npm run build:web");
