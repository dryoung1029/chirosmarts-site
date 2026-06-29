/**
 * Admin: step 2 of hero-image generation — generate the image from the (possibly
 * edited) prompt via Imagen, store it in R2 at a deterministic key, and point
 * the post's heroImage at the public serve route. Access enforced in middleware.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import {
  generateHeroImage,
  GeminiNotConfiguredError,
} from "@/lib/blog";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const row = await db
    .select({ id: schema.blogPosts.id })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!row) return redirect("/admin/blog", 303);

  const form = await request.formData();
  const prompt = String(form.get("heroPrompt") ?? "").trim();
  if (!prompt) return redirect(`${back}?msg=Generate+or+write+a+hero+prompt+first#hero`, 303);

  try {
    const { bytes, contentType } = await generateHeroImage(env, prompt);
    const key = `blog-hero/${id}.png`;
    await env.DOCS.put(key, bytes, { httpMetadata: { contentType } });
    // Cache-bust the public URL so a regenerated image shows immediately.
    const heroImage = `/blog/hero/${id}?v=${Date.now()}`;
    await db
      .update(schema.blogPosts)
      .set({ heroImage, heroPrompt: prompt, updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Hero+image+generated#hero`, 303);
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return redirect(`${back}?msg=Set+GEMINI_API_KEY+to+generate+images#hero`, 303);
    }
    const detail = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
    return redirect(`${back}?msg=${encodeURIComponent("Image generation failed: " + detail)}#hero`, 303);
  }
};
