/**
 * Markdown → HTML for DB-stored content (blog posts), rendered SSR.
 * Authored only by site admins, so the Markdown is trusted (no sanitizer dep).
 */
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  return marked.parse(md ?? "", { async: false }) as string;
}
