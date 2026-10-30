import { createRequire } from 'node:module'
import { join } from 'pathe'
import { mergeRsbuildConfig } from '@rsbuild/core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { ENTRY_POINTS } from '../constants'
import type { EnvironmentConfig, Rspack } from '@rsbuild/core'
import type { ResolvedStartEntryPlan } from '../planning'
import type { RsbuildEnvironmentOverrides } from './types'
import type { ScriptFormat } from '@tanstack/router-core'

const require = createRequire(import.meta.url)

export const RSBUILD_ENVIRONMENT_NAMES = {
  client: 'client',
  server: 'ssr',
} as const

/**
 * Rspack layer names for the rsbuild RSC layered model.
 * These match the canonical names from `rspack.experiments.rsc.Layers`.
 */
export const RSBUILD_RSC_LAYERS = {
  /** React Server Components layer — uses `react-server` resolve condition */
  rsc: 'react-server-components',
  /** Server-Side Rendering layer — standard Node resolve */
  ssr: 'server-side-rendering',
} as const

export const RSBUILD_CLIENT_ASSETS_DIR = 'assets'

export type RsbuildEnvironmentName =
  (typeof RSBUILD_ENVIRONMENT_NAMES)[keyof typeof RSBUILD_ENVIRONMENT_NAMES]

type RsbuildDistPath = NonNullable<EnvironmentConfig['output']>['distPath']
type RsbuildDistPathObject = Exclude<RsbuildDistPath, string>

function createPublicAssetDistPath(root: string): RsbuildDistPathObject {
  return {
    root,
    css: `${RSBUILD_CLIENT_ASSETS_DIR}/css`,
    cssAsync: `${RSBUILD_CLIENT_ASSETS_DIR}/css/async`,
    svg: `${RSBUILD_CLIENT_ASSETS_DIR}/svg`,
    font: `${RSBUILD_CLIENT_ASSETS_DIR}/font`,
    wasm: `${RSBUILD_CLIENT_ASSETS_DIR}/wasm`,
    image: `${RSBUILD_CLIENT_ASSETS_DIR}/image`,
    media: `${RSBUILD_CLIENT_ASSETS_DIR}/media`,
    assets: `${RSBUILD_CLIENT_ASSETS_DIR}/assets`,
  }
}

function createClientAssetDistPath(root: string): RsbuildDistPathObject {
  return {
    ...createPublicAssetDistPath(root),
    js: `${RSBUILD_CLIENT_ASSETS_DIR}/js`,
    jsAsync: `${RSBUILD_CLIENT_ASSETS_DIR}/js/async`,
  }
}

/** The file of a virtual module (VirtualModulesPlugin resolves it relative to the root). */
export function virtualPath(root: string, moduleId: string): string {
  // Use a recognizable prefix to avoid collisions with real files.
  const sanitized = moduleId.replace(/[:#]/g, '_')
  return `${root}/node_modules/.virtual/${sanitized}.js`
}

/**
 * Chunk splitting of a non-RSC server environment. Rsbuild's server default
 * is no splitting at all, which makes Rspack copy every module two async
 * chunks share into both: the server-fn resolver `import()`s the modules
 * that define server functions, which the router's chunk holds too. The
 * router's chunk and the resolver's provider chunks become one chunk (the
 * router is always loaded before a server function runs, so a separate
 * shared chunk only costs a file and chunk boundaries); a module two other
 * async chunks share goes to one shared chunk instead (Rspack's default
 * groups are off: nothing else moves). The dev server keeps the shared
 * chunk only: one instance of each module is all it needs, and the router
 * group's test would run on every rebuild for bytes nobody ships.
 */
function serverSplitChunks(root: string, dev: boolean) {
  const resolver = virtualPath(root, VIRTUAL_MODULES.serverFnResolver)
  const importedBy = (group: Rspack.ChunkGroup, path: string) =>
    group.origins.some((origin) => origin.module?.nameForCondition() === path)
  // The router's chunk and the provider chunks, when the resolver imports
  // providers (without them the router's chunk keeps its numeric id: a
  // name costs the runtime an id → file-name entry).
  const routerOrProvider = (chunk: Rspack.Chunk) => {
    for (const group of chunk.groupsIterable) {
      if (importedBy(group, resolver)) {
        return true
      }
      if (
        group.origins.some(
          (origin) => origin.request === ENTRY_POINTS.router,
        ) &&
        group
          .getParents()
          .some((parent) =>
            parent.childrenIterable.some((sibling) =>
              importedBy(sibling, resolver),
            ),
          )
      ) {
        return true
      }
    }
    return false
  }
  return {
    preset: 'none',
    chunks: 'async',
    cacheGroups: {
      default: false,
      defaultVendors: false,
      ...(!dev && {
        router: {
          name: 'tanstack-start-router',
          chunks: routerOrProvider,
          minSize: 0,
          priority: 1,
        },
      }),
      shared: { minChunks: 2, minSize: 0, reuseExistingChunk: true },
    },
  } as const satisfies EnvironmentConfig['splitChunks']
}

export interface RsbuildResolvedEntryAliases {
  client: string
  server: string
  start: string
  router: string
  alias: Record<(typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS], string>
}

export function createRsbuildResolvedEntryAliases(opts: {
  entryPaths: ResolvedStartEntryPlan['entryPaths']
}): RsbuildResolvedEntryAliases {
  const client = normalizeEntryPath(opts.entryPaths.client)
  const server = normalizeEntryPath(opts.entryPaths.server)
  const start = normalizeEntryPath(opts.entryPaths.start)
  const router = normalizeEntryPath(opts.entryPaths.router)

  return {
    client,
    server,
    start,
    router,
    alias: {
      [ENTRY_POINTS.client]: client,
      [ENTRY_POINTS.server]: server,
      [ENTRY_POINTS.start]: start,
      [ENTRY_POINTS.router]: router,
    },
  }
}

export interface RsbuildEnvironmentPlanResult {
  environments: Record<string, EnvironmentConfig>
  alias: Record<string, string>
}

export function createRsbuildEnvironmentPlan(opts: {
  root: string
  entryAliases: RsbuildResolvedEntryAliases
  clientOutputDirectory: string
  serverOutputDirectory: string
  publicBase: string
  environmentOverrides?: RsbuildEnvironmentOverrides
  scriptFormat?: ScriptFormat
  rsc?: boolean | undefined
  dev?: boolean | undefined
}): RsbuildEnvironmentPlanResult {
  const alias = {
    ...opts.entryAliases.alias,
    ...(opts.rsc
      ? {
          'react-server-dom-rspack/server$': resolveFromRoot(
            'react-server-dom-rspack/server.node',
            opts.root,
          ),
        }
      : {}),
  }
  const environmentOverrides = opts.environmentOverrides ?? {}
  const scriptFormat = opts.scriptFormat ?? 'module'
  const clientOutputModule = scriptFormat === 'module'
  const userClientOutputModule =
    environmentOverrides.client?.output?.module ??
    environmentOverrides.all?.output?.module

  if (
    typeof userClientOutputModule === 'boolean' &&
    userClientOutputModule !== clientOutputModule
  ) {
    throw new Error(
      'TanStack Start rsbuild.client.output controls environments.client.output.module. Remove environments.client.output.module or set rsbuild.client.output to match it.',
    )
  }

  return {
    environments: {
      [RSBUILD_ENVIRONMENT_NAMES.client]: mergeRsbuildConfig(
        {
          source: {
            entry: {
              index: {
                import: opts.entryAliases.client,
                html: false,
              },
            },
          },
          output: {
            target: 'web',
            module: clientOutputModule,
            distPath: createClientAssetDistPath(opts.clientOutputDirectory),
            assetPrefix: opts.publicBase,
          },
          resolve: {
            alias,
          },
          // Only split async chunks (route code-splitting). Keep all initial
          // vendor/shared code inlined in the entry chunk so the SSR HTML only
          // needs the single client entry bootstrap.
          splitChunks: {
            preset: 'none',
            chunks: 'async',
          },
        },
        environmentOverrides.all,
        environmentOverrides.client,
      ),
      [RSBUILD_ENVIRONMENT_NAMES.server]: mergeRsbuildConfig(
        {
          source: {
            entry: {
              index: {
                import: opts.entryAliases.server,
                html: false,
                ...(opts.rsc ? { layer: RSBUILD_RSC_LAYERS.ssr } : {}),
              },
            },
          },
          output: {
            target: 'node',
            // Rsbuild's dev `loadBundle()` path evaluates ESM via vm.SourceTextModule,
            // which requires `--experimental-vm-modules`. Emit CJS for the dev
            // server bundle so SSR works without extra Node flags.
            ...(opts.dev ? { module: false } : {}),
            distPath: createPublicAssetDistPath(opts.serverOutputDirectory),
            assetPrefix: opts.publicBase,
          },
          resolve: {
            alias,
          },
          splitChunks: opts.rsc
            ? { preset: 'single-vendor' }
            : serverSplitChunks(opts.root, opts.dev === true),
        },
        environmentOverrides.all,
        environmentOverrides.server,
      ),
    },
    alias,
  }
}

export function resolveRsbuildOutputDirectory(opts: {
  distPath: RsbuildDistPath | undefined
  rootDistPath: RsbuildDistPath | undefined
  fallback: string
  subdirectory: string
}): string {
  if (typeof opts.distPath === 'string') {
    return opts.distPath
  }

  if (typeof opts.distPath?.root === 'string') {
    return opts.distPath.root
  }

  if (typeof opts.rootDistPath === 'string') {
    return join(opts.rootDistPath, opts.subdirectory)
  }

  if (typeof opts.rootDistPath?.root === 'string') {
    return join(opts.rootDistPath.root, opts.subdirectory)
  }

  return opts.fallback
}

function normalizeEntryPath(path: string) {
  return path.includes('\\') ? path.replaceAll('\\', '/') : path
}

function resolveFromRoot(specifier: string, root: string): string {
  return require.resolve(specifier, {
    paths: [root],
  })
}
