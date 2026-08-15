# TanStack Start + Bun Bundler

Minimal example that builds with **Bun as the bundler** (no Vite).

## vs `start-bun`

| | [`start-bun`](../start-bun) | **this example** |
|--|--|--|
| Dev / build | Vite (`vite dev` / `vite build`) | `tanstackStart().dev()` / `.build()` via Bun |
| Production host | `Bun.serve` + Vite `dist` | `host.js` / 可选 Nitro `.output` / 可选 standalone 可执行文件 |
| Plugin entry | `@tanstack/react-start/plugin/vite` | `@tanstack/react-start/plugin/bun` |

## Scripts

```bash
cd examples/react/start-bun-bundler
bun run build              # → dist/client + dist/server/server.js + host.js
bun run start              # bun dist/server/host.js
bun run build:nitro        # + bun.nitro → .output/
bun run start:nitro        # node .output/server/index.mjs
bun run build:standalone   # + bun.standalone → dist/server/start
bun run start:standalone   # ./dist/server/start
bun run dev
bun run smoke
bun run smoke:nitro
bun run smoke:standalone
```

## Production hosts

1. **Default (Rsbuild-style):** `dist/server/host.js` — deploy `dist/` + Bun
2. **Optional Nitro:** `bun.nitro` → `.output`（多 preset）
3. **Optional standalone executable:** `bun.standalone` → `dist/server/start`（嵌入 `dist/client`；体积大、按 OS/arch）

`bun.nitro` 与 `bun.standalone` 可并存；standalone **始终基于 `dist/`**，不从 `.output` 再编译。

## What this proves

- Dual `Bun.build` without Vite
- SSR + prerender + static host / optional Nitro / optional `--compile` executable
- Code-splitting, import protection, CSS pipeline, ESM HMR（dev）

## Known gaps

- No RSC；Nitro/standalone 仅生产；asset 管线仍薄于 Vite

See `packages/start-plugin-core/src/bun/ARCHITECTURE.md`.

## 给其它仓库用（GitHub Packages）

本 fork 可通过 GitHub Packages 发布 `@running-grass/*`（脚本重写 scope）。其它仓用 npm alias 继续依赖 `@tanstack/*`。

详见 [`scripts/github-packages/README.md`](../../../scripts/github-packages/README.md)。
