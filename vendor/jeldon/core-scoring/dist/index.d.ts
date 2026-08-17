import { SeoConfig, GeoConfig, ScoringConfig } from '@jeldon/config';

type ScoreStatus = 'good' | 'meh' | 'bad';
interface ScoreCheck {
    status: ScoreStatus;
    label: string;
    value: string;
}
interface ScoreResult {
    score: number;
    checks: ScoreCheck[];
    badCount: number;
    mehCount: number;
}
interface ScorableInput {
    title: string;
    excerpt: string;
    tags: string[];
    body: string;
    slug: string;
    heroImage?: string;
    heroImageAlt?: string;
}

/**
 * Classical SEO health score. Ported from Body of Health `calculateSeo`, with
 * every band, prefix list and trigger lifted into `SeoConfig`. Unweighted mean
 * of per-check status (good=1, meh=0.5, bad=0).
 */
declare function calculateSeo(input: ScorableInput, cfg?: SeoConfig): ScoreResult;

/**
 * GEO — Generative Engine Optimization. Per-article "citability" score for
 * answer engines (ChatGPT, Claude, Perplexity, Gemini, Google AIO). Based on
 * the patterns the Princeton GEO 2024 paper (Aggarwal et al.) found to lift
 * citation rate. Ported from Body of Health `calculateGeo`, with every regex,
 * threshold and weight lifted into `GeoConfig` so the engine is domain-agnostic.
 */
declare function calculateGeo(input: ScorableInput, cfg?: GeoConfig): ScoreResult;

/**
 * Flesch-Kincaid Grade Level for body prose, using a vowel-group syllable
 * heuristic — close enough to formal FKGL for editorial signal. Strips markdown
 * decoration + code blocks so syntax characters aren't counted as words.
 * Ported verbatim from Body of Health `src/lib/admin/seo.ts`; fully isomorphic.
 */
declare function fleschKincaidGrade(text: string): number | null;

/** Run both scorers with a single ScoringConfig (e.g. `pack.scoring`). */
declare function scoreArticle(input: ScorableInput, scoring?: ScoringConfig): {
    seo: ScoreResult;
    geo: ScoreResult;
};

export { type ScorableInput, type ScoreCheck, type ScoreResult, type ScoreStatus, calculateGeo, calculateSeo, fleschKincaidGrade, scoreArticle };
