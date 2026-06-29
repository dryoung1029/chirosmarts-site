import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Legal documents (Terms of Service, Privacy Policy) authored as markdown so the
// owner can edit them with a commit. `version` must match src/config/legal.ts.
const legal = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/legal" }),
  schema: z.object({
    title: z.string(),
    lastUpdated: z.string(),
    version: z.string(),
  }),
});

// Owner-supplied testimonials. Empty dir → grid renders nothing (no fabrication).
const testimonials = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/testimonials" }),
  schema: z.object({
    quote: z.string(),
    name: z.string(),
    role: z.string().optional(),
    clinic: z.string().optional(),
    photo: z.string().optional(),
    courseTag: z.string().optional(), // course slug to filter by on course pages
  }),
});

// Long-form pillar guides (SEO). Markdown bodies authored by the owner.
const guides = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string().optional(),
    authorCredentials: z.string().optional(),
    lastUpdated: z.string(),
    relatedCourse: z.string().optional(), // course slug for the related-course card
  }),
});

// In-app Help Center articles (how-to / FAQ for using the platform). Distinct
// from `guides` (public SEO long-reads) and the AI course tutor (lesson content
// only). `audience` drives role-aware ordering on /help; `category` groups them.
const help = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/help" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    audience: z.enum(["everyone", "student", "clinic", "admin"]).default("everyone"),
    category: z.string(),
    order: z.number().default(100),
    related: z.array(z.string()).optional(), // related help slugs
    updated: z.string().optional(),
  }),
});

export const collections = { legal, testimonials, guides, help };
