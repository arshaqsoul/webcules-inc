/* The core runs in plain node on purpose: if a test here needs Snap, workerd or D1,
 * the core has a host dependency it should not have. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
