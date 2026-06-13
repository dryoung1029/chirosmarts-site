/** Admin: AI-suggest a module description from its transcripts (access enforced in middleware). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { suggestModuleDescription } from "@/lib/module-description";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const result = await suggestModuleDescription(db, env, params.id!);
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ description: result.description });
};
