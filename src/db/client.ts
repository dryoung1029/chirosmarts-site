import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Build a Drizzle client bound to the request's D1 database.
 * Usage in an Astro page/endpoint:
 *   const db = getDb(Astro.locals.runtime.env);
 */
export function getDb(env: CloudflareEnv) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
