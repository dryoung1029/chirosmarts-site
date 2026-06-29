# Vendored Jeldon engine (temporary bridge)

These are **pre-built** `@jeldon/*` packages from `dryoung1029/jeldon`, vendored
here and consumed via `file:` deps in the root `package.json`. This is a
deliberate, temporary bridge: the engine is a private pnpm monorepo and isn't
published to a registry yet, and chirosmarts is npm-on-Cloudflare. Vendoring the
**real built packages** (not a hand-written mirror) keeps Constitution Rule 4
("one scorer, no mirrors") intact — chirosmarts imports the genuine
`@jeldon/core-scoring`, `@jeldon/schema-graph`, etc.

## What's here

`config`, `core-scoring`, `schema-graph`, `aeo-audit`, `cli` — each with its
built `dist/` and a lean `package.json` whose internal `@jeldon/*` deps were
rewritten from pnpm `workspace:*` to local `file:../<pkg>` so npm resolves them.

## Re-vendoring after an engine update

```bash
# in a clone of dryoung1029/jeldon at the desired commit:
pnpm install && pnpm build
# then re-run the vendor step (see commit that introduced this dir) to copy
# packages/<pkg>/dist + package.json into vendor/jeldon/<pkg> with deps rewritten.
```

## Migration to GitHub Packages (the real Option A)

When the engine publishes to GitHub Packages under the `@jeldon` scope:

1. Delete `vendor/jeldon/`.
2. In root `package.json`, change the five `@jeldon/*` deps from
   `file:vendor/jeldon/<pkg>` to a version range (e.g. `^0.1.0`).
3. Add an `.npmrc`: `@jeldon:registry=https://npm.pkg.github.com`, and expose a
   `read:packages` token as `NODE_AUTH_TOKEN` in the Cloudflare Pages build env.

`jeldon.config.ts` and every import site stay **unchanged** — only the install
source flips. That's the whole point of the Domain Pack boundary.
