import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { generateSerializationAdaptersModule } from '../serialization-adapters-module'
import { buildStartManifest } from '../start-manifest-plugin/manifestBuilder'
import { escapeRegExp } from '../utils'
import { RSBUILD_ENVIRONMENT_NAMES, virtualPath } from './planning'
import type {
  RsbuildPluginAPI,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'
import type {
  GetConfigFn,
  NormalizedClientBuild,
  SerializationAdapterConfig,
} from '../types'
import type { InlineCssOptions } from '../start-manifest-plugin/manifestBuilder'
import type { ScriptFormat } from '@tanstack/router-core'

type RspackNamespace = typeof rspackNamespaceType
type RspackVirtualModulesPlugin = InstanceType<
  RspackNamespace['experiments']['VirtualModulesPlugin']
>

// Virtual module IDs for RSC (must match what react-start-rsc imports)
const RSC_RUNTIME_VIRTUAL_ID = 'virtual:tanstack-rsc-runtime'
const RSC_HMR_VIRTUAL_ID = 'virtual:tanstack-rsc-hmr'
const RSC_BROWSER_DECODE_VIRTUAL_ID = 'virtual:tanstack-rsc-browser-decode'
const RSC_SSR_DECODE_VIRTUAL_ID = 'virtual:tanstack-rsc-ssr-decode'
export const START_MANIFEST_PLACEHOLDER = '__TSS_START_MANIFEST_PLACEHOLDER__'
const DEV_START_MANIFEST_GLOBAL = '__TSS_DEV_START_MANIFEST__'
/**
 * VirtualModulesPlugin resolves module paths relative to compiler.context.
 * Prefix them under the app root so they are unique and watcher-friendly.
 */
export interface VirtualModuleState {
  /** Call to update manifest content after client build completes */
  updateManifest: (clientBuild: NormalizedClientBuild) => void
  /** Call to update server fn resolver content after compilation discovers fns */
  updateServerFnResolver: () => void
  /** Number of times the server fn resolver module was written (the server environment's) */
  getServerFnResolverWriteCount: () => number
  /** Get the virtual path for a given module ID */
  getVirtualPath: (moduleId: string) => string
  /** Writes a virtual module file of an environment (queued until its compiler is ready). */
  writeModule: (
    environmentName: string,
    filePath: string,
    content: string,
  ) => void
  /** The absolute virtual path of the server fn resolver module */
  serverFnResolverPath: string
  /** The absolute virtual path of the manifest module */
  manifestPath: string
  /** Generate manifest module content from a given client build */
  generateManifestContent: (clientBuild: NormalizedClientBuild) => string
  /** Generate the serialized manifest value literal for asset patching */
  generateManifestValueLiteral: (clientBuild: NormalizedClientBuild) => string
  /** VirtualModulesPlugin instances keyed by environment name */
  vmPlugins: Record<string, RspackVirtualModulesPlugin>
}

// ---------------------------------------------------------------------------
// Manifest module codegen
// ---------------------------------------------------------------------------

function getScriptFormatProperty(scriptFormat: ScriptFormat): string {
  return scriptFormat === 'iife' ? `  scriptFormat: 'iife',\n` : ''
}

function getEntryScriptAttrs(
  entryUrl: string,
  scriptFormat: ScriptFormat,
): string {
  return scriptFormat === 'module'
    ? `{ type: 'module', async: true, src: '${entryUrl}' }`
    : `{ async: true, src: '${entryUrl}' }`
}

function generateManifestModuleDev(
  devClientEntryUrl: string,
  scriptFormat: ScriptFormat,
): string {
  const scriptFormatProperty = getScriptFormatProperty(scriptFormat)
  return `const fallbackManifest = {
${scriptFormatProperty}  routes: {
    __root__: {
      preloads: ['${devClientEntryUrl}'],
      scripts: [{ attrs: ${getEntryScriptAttrs(devClientEntryUrl, scriptFormat)} }],
    },
  },
}
export const tsrStartManifest = () => globalThis[${JSON.stringify(DEV_START_MANIFEST_GLOBAL)}] ?? fallbackManifest`
}

function buildStartManifestData(
  clientBuild: NormalizedClientBuild,
  publicBase: string,
  inlineCss: InlineCssOptions,
  scriptFormat: ScriptFormat,
) {
  const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
  return buildStartManifest({
    clientBuild,
    routeTreeRoutes,
    basePath: publicBase,
    inlineCss,
    scriptFormat,
  })
}

function serializeStartManifestData(
  clientBuild: NormalizedClientBuild,
  publicBase: string,
  inlineCss: InlineCssOptions,
  scriptFormat: ScriptFormat,
): string {
  return JSON.stringify(
    buildStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat),
  )
}

function generateManifestModuleBuild(
  clientBuild: NormalizedClientBuild | undefined,
  publicBase: string,
  inlineCss: InlineCssOptions,
  scriptFormat: ScriptFormat,
): string {
  if (!clientBuild) {
    return `const tsrStartManifestData = ${JSON.stringify(START_MANIFEST_PLACEHOLDER)}
export const tsrStartManifest = () => tsrStartManifestData`
  }

  return `export const tsrStartManifest = () => (${serializeStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat)})`
}

/**
 * Generate virtual:tanstack-rsc-runtime content.
 * In the RSC layer this re-exports from react-server-dom-rspack/server.
 * In other layers it provides stubs that throw.
 */
function generateRscRuntimeModule(isRscLayer: boolean): string {
  if (isRscLayer) {
    // Re-export the RSC runtime functions from react-server-dom-rspack/server.
    // NOTE: `createFromReadableStream` is a CLIENT-side API — it's NOT exported
    // by react-server-dom-rspack/server. The RSC layer never needs it (RSC
    // renders TO streams, doesn't decode FROM them). We provide a stub that
    // throws so the export surface stays consistent across bundlers.
    return `export { renderToReadableStream, createTemporaryReferenceSet, decodeReply, decodeAction, decodeFormState } from 'react-server-dom-rspack/server'
export function createFromReadableStream() { throw new Error('createFromReadableStream is not available in RSC environment (use SSR or browser decode instead)'); }
// loadServerAction is provided by the RSC entry, not react-server-dom-rspack
import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export const loadServerAction = async (id) => getServerFnById(id, { origin: 'server' })`
  }

  // In other layers, provide stubs that throw
  return `
export function renderToReadableStream() { throw new Error('renderToReadableStream can only be used in RSC environment'); }
export function createFromReadableStream() { throw new Error('createFromReadableStream can only be used in RSC environment'); }
export function createTemporaryReferenceSet() { throw new Error('createTemporaryReferenceSet can only be used in RSC environment'); }
export function decodeReply() { throw new Error('decodeReply can only be used in RSC environment'); }
export function loadServerAction() { throw new Error('loadServerAction can only be used in RSC environment'); }
export function decodeAction() { throw new Error('decodeAction can only be used in RSC environment'); }
export function decodeFormState() { throw new Error('decodeFormState can only be used in RSC environment'); }
`
}

/**
 * Generate virtual:tanstack-rsc-hmr content.
 * In the client env during dev, listens for rsc:update WebSocket events
 * and invalidates the router. In all other contexts, exports nothing.
 */
function generateRscHmrModule(isClientEnv: boolean, isDev: boolean): string {
  if (!isClientEnv || !isDev) {
    return 'export function setupRscHmr() {}'
  }

  // Rsbuild dev server delivers custom WebSocket events through
  // import.meta.webpackHot.on(event, cb). The server-side
  // sockWrite('custom', { event: 'rsc:update' }) maps directly to that.
  return `
// RSC HMR listener for rsbuild dev server
// Listens for 'rsc:update' custom events sent via sockWrite
export function setupRscHmr() {
  let __invalidateQueued = false

  function __queueInvalidate() {
    if (__invalidateQueued) return
    __invalidateQueued = true
    queueMicrotask(async () => {
      __invalidateQueued = false
      try {
        const router = window.__TSR_ROUTER__
        if (!router) {
          console.warn('[rsc:hmr] No router found on window.__TSR_ROUTER__')
          return
        }
        await router.invalidate()
      } catch (e) {
        console.warn('[rsc:hmr] Failed to invalidate router:', e)
      }
    })
  }

  if (import.meta.webpackHot) {
    import.meta.webpackHot.on('rsc:update', () => {
      __queueInvalidate()
    })
  }
}
`
}

// ---------------------------------------------------------------------------
// Main registration
// ---------------------------------------------------------------------------

export interface RegisterVirtualModulesOptions {
  /** The resolved project root (read when the first Rspack config is built, after `modifyRsbuildConfig`). */
  getRoot: () => string
  getConfig: GetConfigFn
  /** The server fn resolver module content of the current registry. */
  resolverModule: () => string
  serializationAdapters: Array<SerializationAdapterConfig> | undefined
  /**
   * Get the URL at which the rsbuild dev server serves the client entry JS.
   * Called lazily inside modifyRspackConfig when getConfig() is available.
   * Example return: '/assets/js/index.js'
   */
  getDevClientEntryUrl: (publicBase: string) => string
  /** Whether RSC virtual modules should be registered. */
  rscEnabled?: boolean | undefined
  scriptFormat: ScriptFormat
}

/**
 * Registers virtual modules for the rsbuild adapter using VirtualModulesPlugin.
 *
 * Creates one VirtualModulesPlugin per environment and registers them via
 * `modifyBundlerChain`. Provides update functions to refresh content dynamically.
 */
export function registerVirtualModules(
  api: RsbuildPluginAPI,
  opts: RegisterVirtualModulesOptions,
): VirtualModuleState {
  const isDev = api.context.action === 'dev'
  // Virtual module paths keyed by module ID, under the resolved root (J4.16: never `process.cwd()`)
  let resolvedPaths:
    | {
        manifest: string
        serverFnResolver: string
        pluginAdapters: string
        rsc: {
          rscRuntime: string
          rscHmr: string
          rscBrowserDecode: string
          rscSsrDecode: string
        } | null
      }
    | undefined
  const pathsOf = () => {
    if (!resolvedPaths) {
      const root = opts.getRoot()
      resolvedPaths = {
        manifest: virtualPath(root, VIRTUAL_MODULES.startManifest),
        serverFnResolver: virtualPath(root, VIRTUAL_MODULES.serverFnResolver),
        pluginAdapters: virtualPath(root, VIRTUAL_MODULES.pluginAdapters),
        rsc: opts.rscEnabled
          ? {
              rscRuntime: virtualPath(root, RSC_RUNTIME_VIRTUAL_ID),
              rscHmr: virtualPath(root, RSC_HMR_VIRTUAL_ID),
              rscBrowserDecode: virtualPath(
                root,
                RSC_BROWSER_DECODE_VIRTUAL_ID,
              ),
              rscSsrDecode: virtualPath(root, RSC_SSR_DECODE_VIRTUAL_ID),
            }
          : null,
      }
    }
    return resolvedPaths
  }

  // Track VirtualModulesPlugin instances per environment for dynamic updates
  const vmPlugins: Record<string, RspackVirtualModulesPlugin> = {}
  const readyVmPlugins: Record<string, boolean> = {}
  const pendingWrites = new Map<string, Map<string, string>>()

  let clientBuild: NormalizedClientBuild | undefined
  // the server fn resolver module lives in the server environment only
  let lastResolverContent: string | undefined
  let resolverWriteCount = 0
  const hasSerializationAdapters = Boolean(opts.serializationAdapters?.length)

  function writeResolverContent(content: string) {
    const changed = content !== lastResolverContent
    if (changed) {
      lastResolverContent = content
      // the count tells the resolver rebuild whether the content it last
      // rebuilt from is still current
      resolverWriteCount++
    }
    if (!isDev || changed) {
      tryWriteModule(
        RSBUILD_ENVIRONMENT_NAMES.server,
        pathsOf().serverFnResolver,
        content,
      )
    }
  }

  function queuePendingWrite(
    environmentName: string,
    filePath: string,
    content: string,
  ) {
    let writes = pendingWrites.get(environmentName)
    if (!writes) {
      writes = new Map()
      pendingWrites.set(environmentName, writes)
    }
    writes.set(filePath, content)
  }

  function tryWriteModule(
    environmentName: string,
    filePath: string,
    content: string,
  ) {
    const vmPlugin = vmPlugins[environmentName]
    if (!vmPlugin || !readyVmPlugins[environmentName]) {
      queuePendingWrite(environmentName, filePath, content)
      return false
    }

    vmPlugin.writeModule(filePath, content)
    return true
  }

  function flushPendingWrites(environmentName: string) {
    if (!readyVmPlugins[environmentName]) {
      return
    }

    const writes = pendingWrites.get(environmentName)
    if (!writes?.size) {
      return
    }

    for (const [filePath, content] of writes) {
      if (!tryWriteModule(environmentName, filePath, content)) {
        return
      }
      writes.delete(filePath)
    }

    if (writes.size === 0) {
      pendingWrites.delete(environmentName)
    }
  }

  // NOTE: getConfig() is deferred — it must NOT be called until modifyRsbuildConfig
  // has resolved (which sets resolvedStartConfig.root). All access to resolvedStartConfig
  // happens inside modifyRspackConfig (which runs after modifyRsbuildConfig) or
  // inside update callbacks (which run even later during/after compilation).

  // Generate initial content for each virtual module per environment
  function getInitialContent(environmentName: string): Record<string, string> {
    // Safe to call getConfig() here — this runs inside modifyRspackConfig
    const { resolvedStartConfig, startConfig } = opts.getConfig()
    const paths = pathsOf()
    const rscPaths = paths.rsc
    const isServerEnv = environmentName === RSBUILD_ENVIRONMENT_NAMES.server
    const isClientEnv = environmentName === RSBUILD_ENVIRONMENT_NAMES.client
    const content: Record<string, string> = {}

    // Manifest — only meaningful for server env
    if (isServerEnv) {
      const devClientEntryUrl = opts.getDevClientEntryUrl(
        resolvedStartConfig.basePaths.publicBase,
      )
      content[paths.manifest] = isDev
        ? generateManifestModuleDev(devClientEntryUrl, opts.scriptFormat)
        : generateManifestModuleBuild(
            clientBuild,
            resolvedStartConfig.basePaths.publicBase,
            startConfig.server.build.inlineCss,
            opts.scriptFormat,
          )
    } else {
      content[paths.manifest] = 'export default {}'
    }

    // Server fn resolver (the server environment provides the server fns)
    if (isServerEnv) {
      content[paths.serverFnResolver] = opts.resolverModule()
    } else {
      // Client doesn't need the resolver but needs a valid module
      content[paths.serverFnResolver] = 'export {}'
    }

    if (hasSerializationAdapters) {
      // Plugin adapters — both environments get environment-specific content
      content[paths.pluginAdapters] = generateSerializationAdaptersModule({
        adapters: opts.serializationAdapters,
        runtime:
          environmentName === RSBUILD_ENVIRONMENT_NAMES.client
            ? 'client'
            : 'server',
      })
    }

    // --- RSC virtual modules ---
    if (rscPaths) {
      // virtual:tanstack-rsc-runtime
      // In the server env, this provides the RSC runtime for the RSC layer.
      // The virtual module content is the same regardless of layer since
      // rspack layers handle module isolation. The RSC entry imports this
      // and the react-server condition on the RSC layer resolves
      // react-server-dom-rspack/server correctly.
      if (isServerEnv) {
        // Server env gets the real RSC runtime (used by RSC layer)
        content[rscPaths.rscRuntime] = generateRscRuntimeModule(true)
      } else {
        // Client env gets stubs
        content[rscPaths.rscRuntime] = generateRscRuntimeModule(false)
      }

      // virtual:tanstack-rsc-hmr
      content[rscPaths.rscHmr] = generateRscHmrModule(isClientEnv, isDev)
      content[rscPaths.rscBrowserDecode] = isClientEnv
        ? `export * from '@tanstack/react-start/rsbuild/browser-decode'`
        : `export function createFromReadableStream() { throw new Error('RSC browser decode is only available in the client environment') }
export function createFromFetch() { throw new Error('RSC browser decode is only available in the client environment') }`
      content[rscPaths.rscSsrDecode] = isServerEnv
        ? `export { setOnClientReference, createFromReadableStream } from '@tanstack/react-start/rsbuild/ssr-decode'`
        : `export function setOnClientReference() {}
export function createFromReadableStream() { throw new Error('RSC SSR decode is only available in the server environment') }`
    }

    return content
  }

  // Build a map from virtual module IDs to their virtual file paths.
  // Scheme-like IDs are rewritten with NormalModuleReplacementPlugin because
  // rspack validates request schemes before normal alias resolution.
  const aliasMapOf = (): Record<string, string> => {
    const paths = pathsOf()
    const aliasMap: Record<string, string> = {
      [VIRTUAL_MODULES.startManifest]: paths.manifest,
      [VIRTUAL_MODULES.serverFnResolver]: paths.serverFnResolver,
    }
    if (hasSerializationAdapters) {
      aliasMap[VIRTUAL_MODULES.pluginAdapters] = paths.pluginAdapters
    }
    if (paths.rsc) {
      aliasMap[RSC_RUNTIME_VIRTUAL_ID] = paths.rsc.rscRuntime
      aliasMap[RSC_HMR_VIRTUAL_ID] = paths.rsc.rscHmr
      aliasMap[RSC_BROWSER_DECODE_VIRTUAL_ID] = paths.rsc.rscBrowserDecode
      aliasMap[RSC_SSR_DECODE_VIRTUAL_ID] = paths.rsc.rscSsrDecode
    }
    return aliasMap
  }

  // Register VirtualModulesPlugin per environment via modifyRspackConfig
  api.modifyRspackConfig((config, utils) => {
    const envName = utils.environment.name
    const initialContent = getInitialContent(envName)

    // Create VirtualModulesPlugin instance
    const VMP = utils.rspack.experiments.VirtualModulesPlugin
    const vmPlugin = new VMP(initialContent)
    vmPlugins[envName] = vmPlugin
    readyVmPlugins[envName] = false
    config.plugins.push(vmPlugin)
    config.plugins.push({
      apply(compiler: {
        hooks: {
          thisCompilation: { tap: (name: string, handler: () => void) => void }
        }
      }) {
        compiler.hooks.thisCompilation.tap(
          'TanStackStartFlushPendingVirtualModules',
          () => {
            readyVmPlugins[envName] = true
            flushPendingWrites(envName)
          },
        )
      },
    })

    // Rewrite scheme-like IDs to the VirtualModulesPlugin-backed file paths.
    const aliasMap = aliasMapOf()
    for (const [moduleId, virtualFilePath] of Object.entries(aliasMap)) {
      const NMR = utils.rspack.NormalModuleReplacementPlugin
      config.plugins.push(
        new NMR(new RegExp(`^${escapeRegExp(moduleId)}$`), virtualFilePath),
      )
    }

    const resolve = config.resolve
    const resolveAlias = (resolve.alias ??= {}) as Record<string, string>
    for (const [moduleId, virtualFilePath] of Object.entries(aliasMap)) {
      if (moduleId !== VIRTUAL_MODULES.startManifest) {
        resolveAlias[moduleId] = virtualFilePath
      }
    }
  })

  return {
    get serverFnResolverPath() {
      return pathsOf().serverFnResolver
    },
    get manifestPath() {
      return pathsOf().manifest
    },
    vmPlugins,

    writeModule(environmentName, filePath, content) {
      tryWriteModule(environmentName, filePath, content)
    },

    generateManifestContent(newClientBuild: NormalizedClientBuild): string {
      const { resolvedStartConfig, startConfig } = opts.getConfig()
      return generateManifestModuleBuild(
        newClientBuild,
        resolvedStartConfig.basePaths.publicBase,
        !isDev
          ? startConfig.server.build.inlineCss
          : { enabled: false, transformAssets: false },
        opts.scriptFormat,
      )
    },

    generateManifestValueLiteral(
      newClientBuild: NormalizedClientBuild,
    ): string {
      const { resolvedStartConfig, startConfig } = opts.getConfig()
      return serializeStartManifestData(
        newClientBuild,
        resolvedStartConfig.basePaths.publicBase,
        !isDev
          ? startConfig.server.build.inlineCss
          : { enabled: false, transformAssets: false },
        opts.scriptFormat,
      )
    },

    updateManifest(newClientBuild: NormalizedClientBuild) {
      clientBuild = newClientBuild
      // Safe to call getConfig() here — runs after client build
      const { resolvedStartConfig } = opts.getConfig()
      if (isDev) {
        ;(
          globalThis as typeof globalThis & {
            [DEV_START_MANIFEST_GLOBAL]?: ReturnType<typeof buildStartManifest>
          }
        )[DEV_START_MANIFEST_GLOBAL] = buildStartManifestData(
          clientBuild,
          resolvedStartConfig.basePaths.publicBase,
          { enabled: false, transformAssets: false },
          opts.scriptFormat,
        )
      }
    },

    updateServerFnResolver() {
      writeResolverContent(opts.resolverModule())
    },

    getServerFnResolverWriteCount(): number {
      return resolverWriteCount
    },

    getVirtualPath(moduleId: string): string {
      return virtualPath(opts.getRoot(), moduleId)
    },
  }
}
