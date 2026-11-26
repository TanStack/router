import { joinURL } from 'ufo'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { rootRouteId } from '@tanstack/router-core/tooling'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../../constants'
import {
  buildStartManifest,
  serializeStartManifest,
} from '../../start-manifest-plugin/manifestBuilder'
import { createVirtualModule } from '../createVirtualModule'
import { writtenBuild } from '../server-fn-plugins'
import { normalizeViteClientBuild } from './normalized-client-build'
import type {
  ClientBuilds,
  ClientManifest,
  ClientOutput,
} from '../compiler-state'
import type { GetConfigFn } from '../../types'
import type { PluginOption, Rollup } from 'vite'

type StartManifestEnvironment = {
  config: {
    command: string
    environments?: Record<string, { isBundled?: boolean } | undefined>
  }
}

export function startManifestPlugin(opts: {
  getConfig: GetConfigFn
  /**
   * The client build of each run (the compiler's sessions): the capture
   * publishes it, the server's manifest module embeds it.
   */
  clientBuilds: ClientBuilds
}): PluginOption {
  let devClientRuntime: string | undefined

  /** The client output of `bundle` (`ClientBuilds.setClientBuild`). */
  const outputOf = (bundle: Rollup.OutputBundle): ClientOutput => ({
    manifest: {
      clientBuild: normalizeViteClientBuild(
        bundle,
        opts.getConfig().startConfig.server.build.inlineCss.enabled,
      ),
      cssCodeSplitDisabledFileName: getAssetFileNameByName(bundle, 'style.css'),
    },
    codes: Object.values(bundle).flatMap((output) =>
      output.type === 'chunk' ? [output.code] : [],
    ),
  })

  return [
    {
      name: 'tanstack-start:start-manifest-dev-client',
      applyToEnvironment(environment) {
        return environment.name === START_ENVIRONMENT_NAMES.client
      },
      configureServer(server) {
        // Vite's separate bundled dev runtime must run before the client entry.
        // Use its SSR output API once available (vitejs/vite#22991).
        devClientRuntime = server.environments[START_ENVIRONMENT_NAMES.client]
          .bundledDev
          ? joinURL(server.config.base, 'bundledDevClient.mjs')
          : undefined
      },
    },
    {
      // The client-build record follows the client output on disk: none
      // once a written build starts rendering (first of the `renderStart`
      // handlers: Vite empties the output directory in that phase), the
      // written output at `writeBundle` (first of its handlers: the files
      // are on disk; the bundle is the written one, after every plugin's
      // `generateBundle`), and an in-memory build's (`write: false`, no
      // watch: nothing is written, nothing can be missing) at its
      // `generateBundle`, but a plugin-rsc scan's (no client build).
      name: 'tanstack-start:start-manifest-client-build',
      applyToEnvironment(environment) {
        return environment.name === START_ENVIRONMENT_NAMES.client
      },
      enforce: 'pre',
      renderStart: {
        order: 'pre',
        handler() {
          if (writtenBuild(this.environment, this.meta.watchMode)) {
            opts.clientBuilds.setClientBuild(this.environment, null)
          }
        },
      },
      generateBundle: {
        // (last: the bundle as every plugin left it)
        order: 'post',
        handler(_options, bundle, isWrite) {
          if (
            this.environment.mode === 'build' &&
            !isWrite &&
            this.environment.config.build.write === false &&
            !opts.clientBuilds.rsc
          ) {
            opts.clientBuilds.setClientBuild(this.environment, outputOf(bundle))
          }
        },
      },
      writeBundle: {
        order: 'pre',
        handler(_options, bundle) {
          if (this.environment.mode === 'build') {
            opts.clientBuilds.setClientBuild(this.environment, outputOf(bundle))
          }
        },
      },
    },
    createVirtualModule({
      name: 'tanstack-start:start-manifest-plugin',
      moduleId: VIRTUAL_MODULES.startManifest,
      enforce: 'pre',
      load() {
        const { resolvedStartConfig } = opts.getConfig()
        const clientEntry = getDevClientEntry({
          basePath: resolvedStartConfig.basePaths.publicBase,
          bundledDev: isClientBundledDev(this.environment),
        })

        if (this.environment.name !== START_ENVIRONMENT_NAMES.server) {
          return getEmptyStartManifestModule(clientEntry, devClientRuntime)
        }

        if (this.environment.config.command === 'serve') {
          return getEmptyStartManifestModule(clientEntry, devClientRuntime)
        }

        const environment = this.environment
        return opts.clientBuilds
          .embedClientBuild(this)
          .then((record) =>
            manifestModule(environment, clientEntry, record?.manifest),
          )
      },
    }),
  ]

  function manifestModule(
    environment: { config: { build: { cssCodeSplit?: boolean } } },
    clientEntry: string,
    manifest: ClientManifest | undefined,
  ) {
    const { resolvedStartConfig, startConfig } = opts.getConfig()
    const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
    // TODO this needs further discussion with vite-rsc, this is a temporary workaround
    // If the client bundle isn't available yet (e.g., during RSC scan builds),
    // return a dummy manifest. The real manifest will be generated in the actual build.
    if (!manifest) {
      return getEmptyStartManifestModule(clientEntry)
    }
    const { clientBuild, cssCodeSplitDisabledFileName } = manifest
    const startManifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes,
      basePath: resolvedStartConfig.basePaths.publicBase,
      inlineCss: startConfig.server.build.inlineCss,
      additionalRouteAssets: getViteAdditionalRouteAssets({
        cssCodeSplitDisabledFileName,
        basePath: resolvedStartConfig.basePaths.publicBase,
        cssCodeSplit: environment.config.build.cssCodeSplit,
      }),
    })

    return `export const tsrStartManifest = () => (${serializeStartManifest(startManifest)})`
  }
}

function getViteAdditionalRouteAssets(options: {
  cssCodeSplitDisabledFileName: string | undefined
  basePath: string
  cssCodeSplit: boolean | undefined
}) {
  if (options.cssCodeSplit !== false) {
    return undefined
  }

  if (!options.cssCodeSplitDisabledFileName) {
    throw new Error(
      "TanStack Start could not find Vite's generated `style.css` manifest entry while `build.cssCodeSplit` is disabled",
    )
  }

  return {
    [rootRouteId]: [
      joinURL(options.basePath, options.cssCodeSplitDisabledFileName),
    ],
  }
}

function getAssetFileNameByName(
  bundle: Rollup.OutputBundle,
  assetName: string,
) {
  for (const fileName in bundle) {
    const bundleEntry = bundle[fileName]!

    if (bundleEntry.type !== 'asset') {
      continue
    }

    if (bundleEntry.name === assetName) {
      return fileName
    }

    if ('names' in bundleEntry && bundleEntry.names.includes(assetName)) {
      return fileName
    }
  }

  return undefined
}

function getEmptyStartManifestModule(
  clientEntry: string,
  clientRuntime?: string,
) {
  if (clientRuntime) {
    const entries = [clientRuntime, clientEntry]
    return `export const tsrStartManifest = () => (${serializeStartManifest({
      routes: {
        [rootRouteId]: {
          preloads: entries,
          scripts: entries.map((src) => ({
            attrs: { type: 'module', async: false, src },
          })),
        },
      },
    })})`
  }

  return `export const tsrStartManifest = () => ({
      routes: {
        __root__: {
          preloads: ['${clientEntry}'],
          scripts: [{ attrs: { type: 'module', async: true, src: '${clientEntry}' } }],
        },
      },
    })`
}

function getDevClientEntry(opts: { basePath: string; bundledDev: boolean }) {
  if (opts.bundledDev) {
    return joinURL(opts.basePath, 'assets', 'index.js')
  }

  return joinURL(opts.basePath, '@id', DEV_CLIENT_ENTRY)
}

function isClientBundledDev(environment: StartManifestEnvironment) {
  return (
    environment.config.command === 'serve' &&
    environment.config.environments?.[START_ENVIRONMENT_NAMES.client]
      ?.isBundled === true
  )
}
