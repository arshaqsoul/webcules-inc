import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/dashboard.db";

export const client = createClient({ url });
export const db = drizzle(client, { schema });
