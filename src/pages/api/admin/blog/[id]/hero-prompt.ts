/**
 * Admin: step 1 of hero-image generation — draft an image-generation prompt in
 * the site's visual style from the article's title/excerpt, and save it (the
 * owner can edit it before generating the image). Access enforced in middleware.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { generateHeroPrompt, NotConfiguredError } from "@/lib/blog";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const post = await db
    .select({ title: schema.blogPosts.title, excerpt: schema.blogPosts.excerpt })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!post) return redirect("/admin/blog", 303);

  try {
    const { prompt } = await generateHeroPrompt(env, {
      title: post.title,
      excerpt: post.excerpt || undefined,
    });
    await db
      .update(schema.blogPosts)
      .set({ heroPrompt: prompt, updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Hero+prompt+ready+%E2%80%94+edit+it+or+generate+the+image#hero`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+draft+a+hero+prompt#hero`, 303);
    }
    return redirect(`${back}?msg=Hero+prompt+failed+please+try+again#hero`, 303);
  }
};
