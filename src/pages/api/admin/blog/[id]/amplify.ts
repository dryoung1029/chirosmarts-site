/**
 * Admin: generate the amplification kit (social channels + newsletter) for a
 * post via @jeldon/amplify, and store it for review. Paid LLM calls; on-demand.
 * Does NOT send anything — copy lands in the editor for you to post/send.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { generateKit, generateNewsletter, AnthropicLlmClient } from "@jeldon/amplify";
import { jeldonConfig } from "@/lib/jeldon";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  if (!env.ANTHROPIC_API_KEY) {
    return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+generate+amplification#amplify`, 303);
  }

  const post = await db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!post) return redirect("/admin/blog", 303);

  const article = {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? "",
    category: (post.tags ?? [])[0],
    tags: post.tags ?? [],
    body: post.bodyMarkdown ?? "",
    heroImage: post.heroImage ?? undefined,
    heroImageAlt: post.heroAlt ?? undefined,
    isDraft: post.status !== "published",
  };

  try {
    const llm = new AnthropicLlmClient({ apiKey: env.ANTHROPIC_API_KEY });
    const pack = { voice: jeldonConfig.voice, brand: jeldonConfig.brand, amplify: jeldonConfig.amplify };
    const [kitRes, newsletter] = await Promise.all([
      generateKit(article, pack, llm),
      generateNewsletter(article, pack, llm),
    ]);
    await db
      .insert(schema.amplifyKits)
      .values({
        postId: id,
        kit: JSON.stringify(kitRes.kit),
        newsletter: JSON.stringify(newsletter),
        model: kitRes.model,
        updatedAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: schema.amplifyKits.postId,
        set: {
          kit: JSON.stringify(kitRes.kit),
          newsletter: JSON.stringify(newsletter),
          model: kitRes.model,
          updatedAt: nowIso(),
        },
      });
    return redirect(`${back}?msg=Amplification+kit+ready#amplify`, 303);
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "error";
    return redirect(`${back}?msg=${encodeURIComponent("Amplify failed — " + detail)}#amplify`, 303);
  }
};
