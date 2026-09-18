import { defineConfig } from "drizzle-kit";

// DATABASE_URL comes from .env.local when set in the shell; the default matches the app default.
export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/dashboard.db",
  },
});
