import { join } from 'pathe'
import { ENTRY_POINTS } from '../constants'
import { normalizePublicBase } from '../planning'
import type {
  EnvironmentConfig,
  RsbuildConfig,
  SourceConfig,
} from '@rsbuild/core'
import type { ResolvedStartEntryPlan } from '../planning'

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
}

export function createRsbuildEnvironmentDefaults(opts: {
  environmentName: string
  config: RsbuildConfig
  isDev: boolean
  rscEnabled: boolean
  serverFnProviderEnv: string
}): EnvironmentConfig {
  const environmentConfig = opts.config.environments?.[opts.environmentName]
  const outputModuleConfigured =
    environmentConfig?.output?.module !== undefined ||
    opts.config.output?.module !== undefined

  if (opts.environmentName === RSBUILD_ENVIRONMENT_NAMES.client) {
    return {
      ...(!outputModuleConfigured
        ? {
            output: {
              module: true,
            },
          }
        : {}),
      ...(environmentConfig?.performance?.chunkSplit === undefined &&
      opts.config.performance?.chunkSplit === undefined
        ? {
            // Only split async chunks (route code-splitting). Keep all initial
            // vendor/shared code inlined in the entry chunk so the SSR HTML
            // only needs the single client entry bootstrap.
            performance: {
              chunkSplit: {
                strategy: 'custom',
                override: {
                  chunks: 'async',
                },
              },
            },
          }
        : {}),
    }
  }

  if (opts.environmentName === RSBUILD_ENVIRONMENT_NAMES.server) {
    return {
      ...(opts.isDev && !outputModuleConfigured
        ? {
            // Rsbuild's dev `loadBundle()` path evaluates ESM via
            // vm.SourceTextModule, which requires
            // `--experimental-vm-modules`. Default the server environment to
            // CJS so SSR works without extra Node flags.
            output: {
              module: false,
            },
          }
        : {}),
      ...(opts.rscEnabled &&
      environmentConfig?.splitChunks === undefined &&
      opts.config.splitChunks === undefined
        ? {
            splitChunks: {
              preset: 'single-vendor',
            },
          }
        : {}),
    }
  }

  if (
    opts.environmentName === opts.serverFnProviderEnv &&
    opts.isDev &&
    !opts.rscEnabled &&
    !outputModuleConfigured
  ) {
    return {
      output: {
        module: false,
      },
    }
  }

  return {}
}

export function createRsbuildEnvironmentPlan(opts: {
  entryAliases: Pick<RsbuildResolvedEntryAliases, 'client' | 'server'>
  clientOutputDirectory: string
  serverOutputDirectory: string
  serverFnProviderEnv: string
  enforcedDefines: NonNullable<SourceConfig['define']>
  enforcedAliases: Record<string, string>
  rsc?: boolean | undefined
}): RsbuildEnvironmentPlanResult {
  const createEnvironment = (environment: {
    entry: string
    target: 'web' | 'node'
    outputDirectory: string
    includeJsAssets?: boolean
    layer?: string
  }): EnvironmentConfig => ({
    source: {
      define: opts.enforcedDefines,
      entry: {
        index: {
          import: environment.entry,
          html: false,
          ...(environment.layer ? { layer: environment.layer } : {}),
        },
      },
    },
    output: {
      target: environment.target,
      distPath: environment.includeJsAssets
        ? createClientAssetDistPath(environment.outputDirectory)
        : createPublicAssetDistPath(environment.outputDirectory),
    },
    resolve: {
      alias: opts.enforcedAliases,
    },
  })

  return {
    environments: {
      [RSBUILD_ENVIRONMENT_NAMES.client]: createEnvironment({
        entry: opts.entryAliases.client,
        target: 'web',
        outputDirectory: opts.clientOutputDirectory,
        includeJsAssets: true,
      }),
      [RSBUILD_ENVIRONMENT_NAMES.server]: createEnvironment({
        entry: opts.entryAliases.server,
        target: 'node',
        outputDirectory: opts.serverOutputDirectory,
        ...(opts.rsc ? { layer: RSBUILD_RSC_LAYERS.ssr } : {}),
      }),
      // When provider is a separate environment (not layered RSC),
      // create a third environment. With the layered RSC setup this branch
      // is not taken because provider maps to the same `ssr` environment.
      ...(opts.serverFnProviderEnv !== RSBUILD_ENVIRONMENT_NAMES.server &&
      !opts.rsc
        ? {
            [opts.serverFnProviderEnv]: createEnvironment({
              entry: opts.entryAliases.server,
              target: 'node',
              outputDirectory: `${opts.serverOutputDirectory}/${opts.serverFnProviderEnv}`,
            }),
          }
        : {}),
    },
  }
}

export function resolveRsbuildAssetBase(opts: {
  config: Pick<RsbuildConfig, 'dev' | 'environments' | 'output' | 'server'>
  environmentName?: string | undefined
  action: 'dev' | 'build' | 'preview' | undefined
}): string {
  const environment = opts.environmentName
    ? opts.config.environments?.[opts.environmentName]
    : undefined
  const assetPrefix =
    opts.action === 'dev'
      ? (environment?.dev?.assetPrefix ?? opts.config.dev?.assetPrefix)
      : (environment?.output?.assetPrefix ?? opts.config.output?.assetPrefix)

  if (assetPrefix === false) {
    return '/'
  }

  return normalizePublicBase(
    typeof assetPrefix === 'string' && assetPrefix !== 'auto'
      ? assetPrefix
      : opts.config.server?.base,
  )
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
