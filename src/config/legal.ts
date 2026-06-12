/**
 * Single place for legal-document placeholders and version strings (PLAN.md
 * Item 2). The owner sets these once. Values are intentionally left as visible
 * placeholders until provided — do NOT invent a legal entity, email, or date.
 *
 * The version strings are recorded in the `terms_accepted` audit event at signup
 * and at each purchase, so a future policy update can require re-acceptance.
 * Keep `termsVersion`/`privacyVersion` in sync with the `version` frontmatter in
 * src/content/legal/*.md (the pages display the frontmatter; events use these).
 */
export const LEGAL = {
  entityName: "[LEGAL ENTITY NAME]",
  contactEmail: "[CONTACT EMAIL]",
  mailingAddress: "[MAILING ADDRESS]",
  effectiveDate: "[EFFECTIVE DATE]",
  termsVersion: "2026-06-draft",
  privacyVersion: "2026-06-draft",
} as const;
