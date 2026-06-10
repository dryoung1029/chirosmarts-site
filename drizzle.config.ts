import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations from src/db/schema.ts.
// Migrations are applied to D1 via wrangler (see package.json db:migrate:* scripts).
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
