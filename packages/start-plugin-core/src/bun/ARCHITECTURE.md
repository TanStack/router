# Bun Adapter Architecture

TanStack Start 的 Bun bundler 适配层。对齐 `rsbuild/`：共享核心（config / planning / start-compiler / manifestBuilder / import-protection / post-build）+ Bun 特有壳。

## 三种生产产物（勿混名）

| 产物 | 配置 | 交付物 | 运行时 |
|------|------|--------|--------|
| **默认 dist** | （无） | `dist/client` + `dist/server/{server.js,host.js}` | 本机 Bun：`bun dist/server/host.js` |
| **Nitro `.output`** | `bun.nitro` | `.output/public` + `.output/server` | 按 preset（如 `node .output/server/index.mjs`） |
| **Standalone 可执行文件** | `bun.standalone` | 如 `dist/server/start`（嵌入 client + server） | 直接跑二进制（OS/arch 绑定） |

与 Vite / Rsbuild 对照：

| 路径 | Nitro | 生产宿主 |
|------|-------|----------|
| **Vite Start** | 应用侧组合 `nitro()` from `nitro/vite` | Nitro → `.output` |
| **Rsbuild Start** | **不支持** Nitro | `dist` + srvx / 静态+`fetch` |
| **Bun bundler** | 可选 `bun.nitro`；另可选 `bun.standalone` | 默认 `host.js`；或 `.output`；或 compile 二进制 |

官方文档里多数「Bun 部署」是 **Vite 打包 + `nitro({ preset: 'bun' })`**（Bun 当 **runtime**），不是 Bun 当 bundler。

## API

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.build()          // client + server Bun.build + host.js + post-build
await start.serve()          // 生产：dist/client 静态 + server.js fetch
const server = await start.dev() // build + Bun.serve + src watch rebuild

// 可选 Nitro → .output（仅生产）
await tanstackStart({ bun: { nitro: { preset: 'node-server' } } }).build()

// 可选 Bun standalone 可执行文件（仅生产；始终基于 dist/，不编 .output）
await tanstackStart({
  bun: { standalone: { outfile: 'dist/server/start' } },
}).build()
```

## 产物契约

| 路径 | 含义 |
|------|------|
| `dist/server/server.js` | 纯 `default.fetch`（可挂到其他宿主） |
| `dist/server/host.js` | **默认生产推荐入口**：先静态 `../client`，再 SSR |
| `dist/client/**` | 浏览器资源（`/assets/...`） |
| `.output/**` | 仅当 `bun.nitro`：Nitro preset 产物 |
| `dist/server/start`（可配置） | 仅当 `bun.standalone`：`Bun.build({ compile })` 可执行文件 |

## 冷构建顺序

1. `prepare`：解析 root / base / outDir，`resolveStartEntryPlan`，seed 虚拟模块
2. Generator：写出 `routeTree.gen.ts` + `TSS_ROUTES_MANIFEST`
3. **Client `Bun.build`**（`target: 'browser'`）
4. 归一化产物 → `NormalizedClientBuild` → 更新 start manifest 虚拟模块
5. 刷新 `#tanstack-start-server-fn-resolver`
6. **Server `Bun.build`**（`target: 'bun'`）
7. 写出 `dist/server/host.js`
8. **若 `bun.nitro`**：`createNitro` → … → `.output`
9. `postBuildWithBun`（prerender / sitemap）
10. **若 `bun.standalone`**：生成嵌入 `dist/client` 的 entry → `Bun.build({ compile })`（**始终嵌入 `dist/client`**，即使 Nitro prerender 写到了 `.output/public`）

## CSS

内置 `createCssAssetsPlugin`（`?url` / 副作用 CSS / 可选 Tailwind）。

## Nitro bridge（可选）

- optional peer `nitro`；`nitro-bridge.ts`；Dev 仍用 Bun host

## Standalone compile（可选）

- `standalone-compile.ts`：`import … with { type: "file" }` 嵌入 public，再 `compile`
- 体积大、按 OS/arch 绑定；交叉编译用 `standalone.target`
- 与 `bun.nitro` 可并存（各产各的）；不互相替代

## 虚拟模块键

| id | 内容 |
|----|------|
| `virtual:tanstack-start-*-entry` / `#tanstack-*` | entry alias |
| `#tanstack-start-server-fn-resolver` | serverFn registry |
| `tanstack-start-manifest:v` | SSR 资源 manifest |
| `#tanstack-start-plugin-adapters` | serialization adapters |

## Dev / HMR

`createBunDevServer`：分类重建 + ESM HMR + React Refresh。Dev **不**跑 Nitro / standalone compile。

## 文件

- `plugin.ts` — 编排
- `nitro-bridge.ts` — 可选 Nitro 3 post-build
- `standalone-compile.ts` — 可选 Bun `--compile` 可执行文件
- `static-host.ts` / `css-assets-plugin.ts` / `post-build.ts` / `dev-server.ts` …
