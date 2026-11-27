import { createIdResolver, normalizePath } from 'vite'
import { DEV_CLIENT_ENTRY, VITE_ENVIRONMENT_NAMES } from '../constants'
import { createVirtualModule } from './createVirtualModule'
import type {
  CompileStartFrameworkOptions,
  GetConfigFn,
  ResolvedStartConfig,
} from '../types'
import type {
  PluginOption,
  ResolvedConfig,
  ViteBuilder,
  ViteDevServer,
} from 'vite'

export function createDevClientEntryPlugin(opts: {
  framework: CompileStartFrameworkOptions
  getClientEntry: () => string
}): PluginOption {
  return createVirtualModule({
    name: 'tanstack-start-core:dev-client-entry',
    moduleId: DEV_CLIENT_ENTRY,
    enforce: 'pre',
    async load() {
      const clientEntryId = normalizePath(opts.getClientEntry()).replaceAll(
        '\\',
        '/',
      )
      const clientEntry = JSON.stringify(clientEntryId)

      if (
        this.environment.mode === 'dev' &&
        this.environment.config.experimental.bundledDev
      ) {
        // Bundled dev imports the hydration entry from this virtual module.
        // Its package's sideEffects: false can otherwise remove that import,
        // leaving only SSR HTML. Preserve the entry's initialization calls.
        const resolvedEntry = await this.resolve(clientEntryId)
        const entry = await this.load({
          id: resolvedEntry?.id ?? clientEntryId,
        })
        entry.moduleSideEffects = true
      }

      if (shouldInjectReactRefreshPreamble(this.environment, opts.framework)) {
        const reactRefresh = await this.resolve?.('/@react-refresh')

        if (!reactRefresh) {
          throw new Error(
            'TanStack Start React dev mode requires the React Refresh runtime, but /@react-refresh could not be resolved. Add @vitejs/plugin-react or another compatible React Refresh Vite plugin to your Vite config.',
          )
        }

        return (
          getReactRefreshPreambleCode(reactRefresh.id) +
          `\nawait import(${clientEntry})`
        )
      }

      return `import ${clientEntry}`
    },
  })
}

function shouldInjectReactRefreshPreamble(
  environment: ReactRefreshEnvironment | undefined,
  framework: CompileStartFrameworkOptions,
) {
  const config = environment?.config

  return (
    framework === 'react' &&
    config?.command === 'serve' &&
    config.consumer === 'client' &&
    config.server?.hmr !== false
  )
}

interface ReactRefreshEnvironment {
  config?: {
    command?: string
    consumer?: string
    server?: {
      hmr?: boolean
    }
  }
}

function getReactRefreshPreambleCode(reactRefreshId: string) {
  return `import { injectIntoGlobalHook } from ${JSON.stringify(reactRefreshId)};
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;`
}

export function createPostBuildPlugin(opts: {
  getConfig: GetConfigFn
  postServerBuild: (opts: {
    startConfig: ReturnType<GetConfigFn>['startConfig']
    builder: ViteBuilder
  }) => Promise<void>
}): PluginOption {
  return {
    name: 'tanstack-start-core:post-build',
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler(builder) {
        const { startConfig } = opts.getConfig()
        await opts.postServerBuild({ builder, startConfig })
      },
    },
  }
}

export function createDevBaseRewritePlugin(opts: {
  shouldRewriteDevBase: () => boolean
  resolvedStartConfig: ResolvedStartConfig
}): PluginOption {
  return {
    name: 'tanstack-start-core:dev-base-rewrite',
    configureServer(server) {
      if (!opts.shouldRewriteDevBase()) {
        return
      }

      const basePrefix = opts.resolvedStartConfig.basePaths.publicBase.replace(
        /\/$/,
        '',
      )

      server.middlewares.use((req, _res, next) => {
        if (req.url && !req.url.startsWith(basePrefix)) {
          req.url = basePrefix + req.url
        }

        next()
      })
    },
  }
}

function isBarePackageSpecifier(source: string): boolean {
  if (
    !source ||
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('\\') ||
    source.startsWith('\0')
  ) {
    return false
  }
  const slashIndex = source.indexOf('/')
  const head = slashIndex === -1 ? source : source.slice(0, slashIndex)
  return !head.includes(':')
}

export function createDevClientDepScanPlugin(opts: {
  providerEnvironmentName: string
}): PluginOption {
  const serverEnvNames = Array.from(
    new Set([opts.providerEnvironmentName, VITE_ENVIRONMENT_NAMES.server]),
  )
  let devServer: ViteDevServer | null = null
  let resolvedConfig: ResolvedConfig | null = null
  let serverIdResolver: ReturnType<typeof createIdResolver> | null = null

  async function canResolveInServerEnvironment(
    source: string,
    importer: string,
  ): Promise<boolean> {
    if (!devServer || !resolvedConfig) {
      return false
    }
    serverIdResolver ??= createIdResolver(resolvedConfig, { scan: true })
    for (const envName of serverEnvNames) {
      const serverEnv = devServer.environments[envName]
      if (!serverEnv) {
        continue
      }
      try {
        const resolved = await serverIdResolver(serverEnv, source, importer)
        if (resolved) {
          return true
        }
      } catch {
        // Try next server environment
      }
    }
    return false
  }

  return {
    name: 'tanstack-start-core:dev-client-dep-scan',
    enforce: 'pre',
    applyToEnvironment: (env) =>
      env.name === VITE_ENVIRONMENT_NAMES.client &&
      env.config.command === 'serve',
    configResolved(viteConfig) {
      resolvedConfig = viteConfig
    },
    configureServer(server) {
      devServer = server
    },
    async resolveId(source, importer, options) {
      if (
        !(options as { scan?: boolean }).scan ||
        !importer ||
        !isBarePackageSpecifier(source)
      ) {
        return undefined
      }

      const resolveOptions: Parameters<typeof this.resolve>[2] = {
        custom: options.custom,
        isEntry: options.isEntry,
        skipSelf: true,
      }
      if ('attributes' in options) {
        const resolveOptionsWithAttributes =
          resolveOptions as typeof resolveOptions & {
            attributes?: unknown
          }
        resolveOptionsWithAttributes.attributes = options.attributes
      }

      try {
        return await this.resolve(source, importer, resolveOptions)
      } catch (error) {
        if (await canResolveInServerEnvironment(source, importer)) {
          return { id: source, external: true }
        }
        throw error
      }
    },
  }
}
