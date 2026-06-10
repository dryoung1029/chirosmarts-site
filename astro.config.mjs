// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// ChiroSmarts runs in SSR mode on Cloudflare (Workers/Pages).
// All times are stored UTC and displayed in America/Los_Angeles (see CLAUDE.md).
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true }, // exposes D1/R2/Stream bindings to `astro dev`
  }),
});
