/**
 * Marketing copy registry (PLAN.md — marketing layer). The owner supplies all
 * factual/claim copy (headlines, stats, testimonials, bios, FAQ). Anything still
 * pending is `null` here and rendered as a VISIBLE `[OWNER COPY: …]` placeholder
 * — never invented. Stats render NOTHING when absent (no fake numbers).
 *
 * Hard rule: do not author statistics, approval statements, testimonials, student
 * counts, or regulatory claims here. Descriptive product-flow copy (how the
 * platform works) is fine; claims are not.
 */
export function ownerCopy(desc: string): string {
  return `[OWNER COPY: ${desc}]`;
}

export const OWNER = {
  hero: {
    headline: null as string | null,
    subhead: null as string | null,
    demoCaption: "A real student dashboard, from first login to certified.",
  },
  // Render nothing when empty — no fabricated figures.
  stats: [] as { value: string; label: string }[],
  instructor: {
    name: null as string | null,
    credentials: null as string | null,
    bio: null as string | null,
    photo: null as string | null, // path under /public or remote URL
  },
  // Homepage FAQ — owner Q&A. Empty → a single visible placeholder.
  homepageFaq: [] as { q: string; a: string }[],
  clinics: {
    headline: null as string | null,
    subhead: null as string | null,
    demoVideoStreamUid: null as string | null, // Cloudflare Stream UID (owner-produced)
  },
  about: null as string | null,
} as const;

/**
 * Per-course marketing data the owner authors (requirements-mapping rows, course
 * FAQ). Keyed by course slug. Missing entries → visible placeholders on the page.
 */
export const COURSE_MARKETING: Record<
  string,
  {
    requirements?: { requires: string; provides: string }[];
    faqs?: { q: string; a: string }[];
  }
> = {
  // e.g. "oregon-ca-initial": { requirements: [{ requires: "...", provides: "..." }], faqs: [...] }
};
