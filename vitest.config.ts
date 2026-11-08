import { defineConfig } from "vitest/config";

// Unit tests for pure compliance logic (seat-time recompute). No DOM/Workers
// runtime needed — these functions are deliberately dependency-free.
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  define: { __BUILD_SHA__: JSON.stringify("test") },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
