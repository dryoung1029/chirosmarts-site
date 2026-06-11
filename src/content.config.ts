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

export const collections = { legal };
