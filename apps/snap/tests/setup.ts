/* Per-test-file setup: bring the isolated D1 to the full migrated schema. */
import { applyMigrations } from "./helpers/db";

await applyMigrations();
