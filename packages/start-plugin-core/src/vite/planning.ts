import { normalizePath } from 'vite'
import { join } from 'pathe'
import { escapePath } from 'tinyglobby'
import {
  DEV_CLIENT_ENTRY,
  ENTRY_POINTS,
  START_ENVIRONMENT_NAMES,
} from '../constants'
import { getBundlerOptions } from '../utils'
import type { CompileStartFrameworkOptions } from '../types'
import type { ResolvedStartEntryPlan } from '../planning'
import type * as vite from 'vite'

export interface ViteResolvedEntryAliases {
  client: string
  server: string
  start: string
  router: string
  alias: Record<(typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS], string>
}

export function createViteResolvedEntryAliases(opts: {
  entryPaths: ResolvedStartEntryPlan['entryPaths']
}): ViteResolvedEntryAliases {
  const client = normalizePath(opts.entryPaths.client)
  const server = normalizePath(opts.entryPaths.server)
  const start = normalizePath(opts.entryPaths.start)
  const router = normalizePath(opts.entryPaths.router)

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

export function createViteConfigPlan(opts: {
  viteConfig: vite.UserConfig
  command: 'serve' | 'build'
  framework: CompileStartFrameworkOptions
  entryAliases: ViteResolvedEntryAliases
  clientOutputDirectory: string
  serverOutputDirectory: string
  serverFnProviderEnv: string
  optimizeDepsExclude: Array<string>
  noExternal: Array<string>
}) {
  return {
    environments: {
      [START_ENVIRONMENT_NAMES.client]: {
        consumer: 'client',
        build: {
          rolldownOptions: {
            input: {
              index:
                opts.command === 'serve'
                  ? DEV_CLIENT_ENTRY
                  : ENTRY_POINTS.client,
            },
          },
          outDir: opts.clientOutputDirectory,
        },
        optimizeDeps: {
          exclude: opts.optimizeDepsExclude,
          // The compiler's dev-only route HMR block imports
          // `@tanstack/<framework>-router/hmr`. The framework plugins exclude
          // the router package from optimization, so the subpath is served
          // from source with the rest of the package (one instance of the
          // HMR state); it must not be pre-bundled on its own: route modules
          // import an optimized chunk late in the client entry's graph, and
          // a post-scan re-optimization invalidates its URL before the
          // browser fetches it (504, the graph never evaluates, the dev
          // client never connects, the buffered reload is lost).
          entries: escapeEntries([
            opts.entryAliases.client,
            opts.entryAliases.router,
          ]),
        },
      },
      [START_ENVIRONMENT_NAMES.server]: {
        consumer: 'server',
        build: {
          ssr: true,
          rolldownOptions: {
            input:
              getBundlerOptions(
                opts.viteConfig.environments?.[START_ENVIRONMENT_NAMES.server]
                  ?.build,
              )?.input ?? opts.entryAliases.server,
          },
          outDir: opts.serverOutputDirectory,
          commonjsOptions: {
            include: [/node_modules/],
          },
          copyPublicDir:
            opts.viteConfig.environments?.[START_ENVIRONMENT_NAMES.server]
              ?.build?.copyPublicDir ?? false,
        },
        optimizeDeps: {
          entries: escapeEntries([
            opts.entryAliases.server,
            opts.entryAliases.start,
            opts.entryAliases.router,
          ]),
        },
      },
      ...(opts.serverFnProviderEnv !== START_ENVIRONMENT_NAMES.server && {
        [opts.serverFnProviderEnv]: {
          build: {
            outDir: join(opts.serverOutputDirectory, opts.serverFnProviderEnv),
          },
          optimizeDeps: {
            entries: escapeEntries([opts.entryAliases.router]),
          },
        },
      }),
    },
    resolve: {
      noExternal: [
        // Start's own packages (`isStartPackage` of `compiler/package-class`)
        '@tanstack/start**',
        `@tanstack/${opts.framework}-start**`,
        ...opts.noExternal,
      ],
      alias: {
        ...opts.entryAliases.alias,
      },
    },
  } satisfies Pick<vite.UserConfig, 'environments' | 'resolve'>
}

export function createViteDefineConfig(opts: {
  command: 'serve' | 'build'
  mode: string | undefined
  serverFnBase: string
  routerBasepath: string
  spaEnabled: boolean | undefined
  devSsrStylesEnabled: boolean
  devSsrStylesBasepath: string
  inlineCssEnabled: boolean
  staticNodeEnv: boolean
  disableCsrfMiddlewareWarning: boolean
}) {
  return {
    ...defineReplaceEnv('TSS_SERVER_FN_BASE', opts.serverFnBase),
    ...defineReplaceEnv('TSS_ROUTER_BASEPATH', opts.routerBasepath),
    ...(opts.command === 'serve'
      ? defineReplaceEnv('TSS_SHELL', opts.spaEnabled ? 'true' : 'false')
      : {}),
    ...defineReplaceEnv(
      'TSS_DEV_SERVER',
      opts.command === 'serve' ? 'true' : 'false',
    ),
    ...defineReplaceEnv(
      'TSS_DEV_SSR_STYLES_ENABLED',
      opts.devSsrStylesEnabled ? 'true' : 'false',
    ),
    ...defineReplaceEnv(
      'TSS_DEV_SSR_STYLES_BASEPATH',
      opts.devSsrStylesBasepath,
    ),
    ...defineReplaceEnv(
      'TSS_INLINE_CSS_ENABLED',
      opts.inlineCssEnabled ? 'true' : 'false',
    ),
    ...defineReplaceEnv(
      'TSS_DISABLE_CSRF_MIDDLEWARE_WARNING',
      opts.disableCsrfMiddlewareWarning ? 'true' : 'false',
    ),
    ...(opts.command === 'build' && opts.staticNodeEnv
      ? {
          'process.env.NODE_ENV': JSON.stringify(
            process.env.NODE_ENV || opts.mode || 'production',
          ),
        }
      : {}),
  } satisfies NonNullable<vite.UserConfig['define']>
}

export async function buildStartViteEnvironments(opts: {
  builder: vite.ViteBuilder
  providerEnvironmentName: string
  /** `build --watch`: an environment's watcher, to follow its builds. */
  followWatcher: (
    environment: vite.BuildEnvironment,
    watcher: vite.Rolldown.RolldownWatcher,
  ) => void
}) {
  const client = getRequiredBuilderEnvironment(
    opts.builder,
    START_ENVIRONMENT_NAMES.client,
    'Client environment not found',
  )
  const server = getRequiredBuilderEnvironment(
    opts.builder,
    START_ENVIRONMENT_NAMES.server,
    'SSR environment not found',
  )

  if (!client.isBuilt) {
    // `build --watch`: the build returns the client's watcher at once; the
    // server embeds the client's build (its files, the functions it
    // references), so the server builds once the client's first build
    // ended. The client's later builds, and a first one that failed, reach
    // the server by cause (`ViteCompilerState.setClientBuild`)
    const output = await opts.builder.build(client)
    if ('on' in output) {
      opts.followWatcher(client, output)
    }
    if (!(await firstBuildEnd(output))) {
      // the watcher was closed before its first build ended: nothing else builds
      return
    }
  }

  if (!server.isBuilt) {
    const output = await opts.builder.build(server)
    if ('on' in output) {
      opts.followWatcher(server, output)
    }
  }

  // the SSR environment is the provider unless an RSC environment is
  if (opts.providerEnvironmentName === START_ENVIRONMENT_NAMES.server) {
    return
  }

  const providerEnv = getRequiredBuilderEnvironment(
    opts.builder,
    opts.providerEnvironmentName,
    `Provider environment "${opts.providerEnvironmentName}" not found`,
  )

  if (!providerEnv.isBuilt) {
    const output = await opts.builder.build(providerEnv)
    if ('on' in output) {
      opts.followWatcher(providerEnv, output)
    }
  }
}

/**
 * Resolves `true` once a watch mode build's first build ended (an output: at
 * once), `false` when its watcher was closed first (a closed watcher reports
 * no end of the build it ran).
 */
function firstBuildEnd(
  output: Awaited<ReturnType<vite.ViteBuilder['build']>>,
): Promise<boolean> {
  if (!('on' in output)) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const settle = (built: boolean) => {
      output.off('event', ended)
      output.off('close', closed)
      resolve(built)
    }
    const ended = (event: vite.Rolldown.RolldownWatcherEvent) => {
      if (event.code === 'END' || event.code === 'ERROR') {
        settle(true)
      }
    }
    const closed = () => settle(false)
    output.on('event', ended)
    output.on('close', closed)
  })
}

function escapeEntries(entries: Array<string>) {
  return entries.map((entry) => escapePath(entry))
}

function defineReplaceEnv<TKey extends string, TValue extends string>(
  key: TKey,
  value: TValue,
): { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue } {
  return {
    [`process.env.${key}`]: JSON.stringify(value),
    [`import.meta.env.${key}`]: JSON.stringify(value),
  } as { [P in `process.env.${TKey}` | `import.meta.env.${TKey}`]: TValue }
}

function getRequiredBuilderEnvironment(
  builder: vite.ViteBuilder,
  environmentName: string,
  errorMessage: string,
) {
  const environment = builder.environments[environmentName]

  if (!environment) {
    throw new Error(errorMessage)
  }

  return environment
}
