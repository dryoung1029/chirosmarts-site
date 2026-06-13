// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// ChiroSmarts runs in SSR mode on Cloudflare (Workers/Pages).
// All times are stored UTC and displayed in America/Los_Angeles (see CLAUDE.md).
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true }, // exposes D1/R2/Stream bindings to `astro dev`
    // On Cloudflare SSR the image service is a runtime passthrough (no sharp at the
    // edge), so we don't rely on astro:assets for the marketing illustrations —
    // those are pre-optimized to static AVIF/WebP/PNG by
    // scripts/build-illustration-assets.mjs and served via a plain <picture>.
    // 'compile' keeps any incidental astro:assets usage building cleanly (build-time
    // sharp, runtime passthrough) instead of warning + falling back.
    imageService: "compile",
  }),
});
