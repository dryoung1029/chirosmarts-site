import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { destroySession } from "@/lib/auth/session";

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  await destroySession(db, cookies);
  return redirect("/login", 302);
};
