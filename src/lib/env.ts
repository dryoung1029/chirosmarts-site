/**
 * Central accessor for the public site URL.
 *
 * SITE_URL must ALWAYS come from the environment — never hard-code the site's
 * URL. It is used to build magic-link emails, Stripe redirect URLs, and
 * certificate verification links, and it changes between local dev, the
 * pages.dev subdomain, and the eventual custom domain.
 */
export function getSiteUrl(env: CloudflareEnv): string {
  const url = env.SITE_URL;
  if (!url) {
    throw new Error(
      "SITE_URL is not set. Define it in .dev.vars (local) or wrangler vars (deployed).",
    );
  }
  return url.replace(/\/$/, "");
}
