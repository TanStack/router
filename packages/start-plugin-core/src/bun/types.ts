import type { TanStackStartCoreOptions } from '../types'

export interface BunCssOptions {
  /**
   * Tailwind v4 via optional peer `@tailwindcss/node`.
   * - `'auto'` (default): enable when CSS references tailwindcss and the peer resolves
   * - `true` / `false`: force on/off
   */
  tailwind?: boolean | 'auto' | undefined
  /** Custom CSS transform; runs before Tailwind when both are set. */
  transform?:
    | ((css: string, ctx: { id: string }) => string | Promise<string>)
    | undefined
  /** Globs for Tailwind class scanning (default under src/). */
  content?: Array<string> | undefined
  /**
   * Optional PostCSS processor (peer `postcss`).
   * When set, runs after `transform` and before Tailwind.
   */
  postcss?:
    | {
        plugins?: Array<unknown>
      }
    | false
    | undefined
  /** Enable CSS Modules for `*.module.css` (default: true). */
  modules?: boolean | undefined
}

/**
 * Optional post-build Nitro 3 bridge (production only).
 * `false` / omitted → `dist/*` + `host.js` only (Rsbuild-style).
 */
export interface BunNitroOptions {
  /** Nitro preset (e.g. `node-server`, `bun`, `vercel`). Default: `node-server`. */
  preset?: string | undefined
  /**
   * Pass-through NitroConfig subset (baseURL, routeRules, hooks, output, …).
   * Start still injects `publicAssets` + `serverEntry` web handler for `server.js`.
   */
  config?: Record<string, unknown> | undefined
}

/**
 * Optional Bun `--compile` standalone executable (production only).
 * Embeds `dist/client` + `server.js` into a single binary for the target OS/arch.
 */
export interface BunStandaloneOptions {
  /** Output path (default: `dist/server/start`, `.exe` on Windows). */
  outfile?: string | undefined
  /**
   * Cross-compile target (e.g. `linux-x64`, `darwin-arm64`).
   * Omitted → current platform (`compile: true`).
   */
  target?: string | undefined
  /** Pass-through Bun `CompileBuildOptions` subset (windows.*, execArgv, …). */
  compile?: Record<string, unknown> | undefined
}

export interface BunCoreOptions {
  /** Client output subdirectory under root (default: dist/client) */
  clientOutDir?: string | undefined
  /** Server output subdirectory under root (default: dist/server) */
  serverOutDir?: string | undefined
  /** Public asset base path (default: /) */
  publicBase?: string | undefined
  /** Public static assets directory (default: `public`, copied into clientOutDir). */
  publicDir?: string | undefined
  /** Dev / serve port */
  port?: number | undefined
  /** Dev / serve hostname */
  hostname?: string | undefined
  /**
   * Minify client/server bundles.
   * Default: `true` for production `build()`, `false` for `dev()`.
   */
  minify?: boolean | undefined
  /**
   * Extra Bun.build plugins prepended for both client and server builds.
   * Use `clientPlugins` / `serverPlugins` for env-specific plugins.
   */
  plugins?: Array<import('bun').BunPlugin> | undefined
  clientPlugins?: Array<import('bun').BunPlugin> | undefined
  serverPlugins?: Array<import('bun').BunPlugin> | undefined
  /** CSS asset pipeline (`?url` / side-effect CSS / CSS Modules + optional Tailwind/PostCSS). */
  css?: BunCssOptions | undefined
  /**
   * Optional Nitro 3 post-build packaging to `.output`.
   * Dev still uses `createBunDevServer` (Nitro is production-only in v1).
   */
  nitro?: false | BunNitroOptions | undefined
  /**
   * Optional Bun standalone executable via `Bun.build({ compile })`.
   * Always based on `dist/` (not `.output`). Production build only.
   */
  standalone?: false | BunStandaloneOptions | undefined
}

export type TanStackStartBunPluginCoreOptions = TanStackStartCoreOptions & {
  providerEnvironmentName: string
  ssrIsProvider: boolean
  bun?: BunCoreOptions | undefined
}

export interface TanStackStartBunAdapter {
  /** Production dual Bun.build (client then server) + host.js */
  build: (opts?: { root?: string }) => Promise<void>
  /** Integrated Bun.serve development server */
  dev: (opts?: {
    root?: string
    port?: number
    hostname?: string
  }) => Promise<{ stop: () => void; port: number; hostname: string }>
  /** Production Bun.serve: dist/client static + dist/server/server.js */
  serve: (opts?: {
    root?: string
    port?: number
    hostname?: string
  }) => Promise<{ stop: () => void; port: number; hostname: string }>
}

export const BUN_ENVIRONMENT_NAMES = {
  client: 'client',
  server: 'ssr',
} as const

export type BunEnvironmentName =
  (typeof BUN_ENVIRONMENT_NAMES)[keyof typeof BUN_ENVIRONMENT_NAMES]
