# TanStack Start + Bun Bundler

Minimal example that builds with **Bun as the bundler** (no Vite).

## vs `start-bun`

| | [`start-bun`](../start-bun) | **this example** |
|--|--|--|
| Dev / build | Vite (`vite dev` / `vite build`) | `tanstackStart().dev()` / `.build()` via Bun |
| Production host | `Bun.serve` + Vite `dist` | **Default:** `host.js` (`dist/server/host.js`) |
| Plugin entry | `@tanstack/react-start/plugin/vite` | `@tanstack/react-start/plugin/bun` |

## Scripts

```bash
cd examples/react/start-bun-bundler
bun run build              # → dist/client + dist/server/server.js + host.js
bun run start              # bun dist/server/host.js
bun run dev
bun run smoke              # default path (CI)
```

### Optional extras (experimental)

```bash
bun run build:nitro        # + bun.nitro → .output/
bun run start:nitro        # node .output/server/index.mjs
bun run smoke:nitro
bun run build:standalone   # + bun.standalone → dist/server/start
bun run start:standalone   # ./dist/server/start
bun run smoke:standalone
```

Prefer the default `host.js` path unless you need Nitro `.output` or a single OS/arch executable. Standalone always embeds `dist/client` (not `.output/public`).

## What this proves

- Dual `Bun.build` without Vite
- SSR + prerender + static `host.js`
- Code-splitting, import protection, CSS pipeline, experimental ESM HMR + React Refresh (dev)

## Known limitations

- **No RSC** — React Server Components are not supported
- Dev HMR is experimental (not Vite-level); some client changes may still full-rebuild
- Nitro / standalone are optional extras (production-only, experimental)

See `packages/start-plugin-core/src/bun/ARCHITECTURE.md`.
