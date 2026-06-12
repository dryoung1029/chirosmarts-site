/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Cloudflare bindings + env vars available at runtime via Astro.locals.runtime.env.
// Keep this in sync with wrangler.toml and .dev.vars.example.
interface CloudflareEnv {
  // Bindings
  DB: D1Database;
  DOCS: R2Bucket;
  // Workers AI (M6 tutor embeddings). Minimal shape — the embedding model
  // returns one vector per input text.
  AI?: {
    run(
      model: string,
      inputs: { text: string[] },
    ): Promise<{ data: number[][] }>;
  };

  // Public vars
  SITE_URL: string;
  ADMIN_EMAILS?: string; // comma-separated emails auto-promoted to site_admin
  CF_WEB_ANALYTICS_TOKEN?: string; // Cloudflare Web Analytics beacon (cookieless)

  // Secrets (set via .dev.vars locally, wrangler secrets in prod)
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CF_ACCOUNT_ID?: string;
  CF_STREAM_API_TOKEN?: string;
  CF_STREAM_CUSTOMER_CODE?: string; // customer-<code> playback subdomain
  CF_STREAM_SIGNING_KEY_ID?: string;
  CF_STREAM_SIGNING_KEY_PEM?: string;
  CF_STREAM_SIGNING_KEY_JWK?: string; // base64-encoded JWK (RSA private key)
  ANTHROPIC_API_KEY?: string;
  // Brevo (marketing email — groundwork only; no campaigns wired). Sync pushes
  // CONFIRMED leads + opted-in users; never non-consented contacts.
  BREVO_API_KEY?: string;
  BREVO_LIST_ID_LEADS?: string;
  BREVO_LIST_ID_USERS?: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    // Populated by src/middleware.ts on every request.
    user: import("@/lib/auth/session").SessionUser | null;
    sessionId: string | null;
  }
}
