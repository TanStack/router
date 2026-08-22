# TanStack Vue Start + Bun Bundler

Minimal example that builds with **Bun as the bundler** (no Vite).

## Scripts

```bash
cd examples/vue/start-bun-bundler
bun run build              # → dist/client + dist/server/server.js + host.js
bun run start              # bun dist/server/host.js
bun run dev
bun run smoke
```

## Production host

**Default (Rsbuild-style):** `dist/server/host.js` — deploy `dist/` + Bun

(This example omits optional Nitro / standalone; see the full matrix in the React example `examples/react/start-bun-bundler`.)

| | Vite-based Start | **this example** |
|--|--|--|
| Dev / build | Vite | `tanstackStart().dev()` / `.build()` via Bun |
| Production host | deployment adapters | `host.js` (`dist/server/host.js`) |
| Plugin entry | `@tanstack/vue-start/plugin/vite` | `@tanstack/vue-start/plugin/bun` |

## What this proves

- Dual `Bun.build` without Vite
- SSR + static host (`host.js`)
- Import protection, CSS pipeline, experimental ESM HMR (dev)

## Known limitations

- **No RSC**
- This minimal example sets `router.autoCodeSplitting: false` so route components stay in the server bundle (Vue SSR + Bun lazy splits need more wiring)
- Dev HMR is experimental (not Vite-level); some client changes may still full-rebuild
- Bun bundler path is experimental

See `packages/start-plugin-core/src/bun/ARCHITECTURE.md`.
