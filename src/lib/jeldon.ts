/**
 * Jeldon engine bridge for ChiroSmarts. jeldon.config.ts (repo root) is the
 * single specialization point; this module re-exports it and exposes the ONE
 * scorer (@jeldon/core-scoring) so the blog editor dial and any CI use the same
 * source of truth — no hand-copied scoring (Constitution Rule 4).
 */
import jeldonConfig from "../../jeldon.config";
import { scoreArticle, type ScorableInput, type ScoreResult } from "@jeldon/core-scoring";

export { jeldonConfig };
export type { ScoreResult };

export interface PostLike {
  title?: string | null;
  excerpt?: string | null;
  tags?: string[] | null;
  bodyMarkdown?: string | null;
  slug?: string | null;
  heroImage?: string | null;
  heroAlt?: string | null;
}

/** Score a post with the engine, fed by the Domain Pack's scoring config. */
export function scorePost(p: PostLike): { seo: ScoreResult; geo: ScoreResult } {
  const input: ScorableInput = {
    title: p.title ?? "",
    excerpt: p.excerpt ?? "",
    tags: p.tags ?? [],
    body: p.bodyMarkdown ?? "",
    slug: p.slug ?? "",
    heroImage: p.heroImage ?? undefined,
    heroImageAlt: p.heroAlt ?? "",
  };
  return scoreArticle(input, jeldonConfig.scoring);
}
