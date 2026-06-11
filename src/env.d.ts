/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Cloudflare bindings + env vars available at runtime via Astro.locals.runtime.env.
// Keep this in sync with wrangler.toml and .dev.vars.example.
interface CloudflareEnv {
  // Bindings
  DB: D1Database;
  DOCS: R2Bucket;

  // Public vars
  SITE_URL: string;

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
}

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    // Populated by src/middleware.ts on every request.
    user: import("@/lib/auth/session").SessionUser | null;
    sessionId: string | null;
  }
}
