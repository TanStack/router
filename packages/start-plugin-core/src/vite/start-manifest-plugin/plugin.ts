import { joinURL } from 'ufo'
import { version as viteVersion } from 'vite'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { rootRouteId } from '@tanstack/router-core'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../../constants'
import {
  buildStartManifest,
  createManifestAssetResolvers,
  serializeStartManifest,
} from '../../start-manifest-plugin/manifestBuilder'
import { createVirtualModule } from '../createVirtualModule'
import { normalizeViteClientBuild } from './normalized-client-build'
import type { GetConfigFn, NormalizedClientBuild } from '../../types'
import type { PluginOption, Rollup } from 'vite'

type StartManifestEnvironment = {
  config: {
    command: string
    environments?: Record<string, { isBundled?: boolean } | undefined>
  }
}

export function startManifestPlugin(opts: {
  getConfig: GetConfigFn
}): PluginOption {
  let clientBuild: NormalizedClientBuild | undefined
  let cssCodeSplitDisabledFileName: string | undefined

  return [
    {
      name: 'tanstack-start:start-manifest-capture-client-build',
      applyToEnvironment(environment) {
        return environment.name === START_ENVIRONMENT_NAMES.client
      },
      enforce: 'post',
      generateBundle(_options, bundle) {
        if (this.environment.name !== START_ENVIRONMENT_NAMES.client) {
          throw new Error(
            `Unexpected environment for client build capture: ${this.environment.name}`,
          )
        }

        clientBuild = normalizeViteClientBuild(
          bundle,
          opts.getConfig().startConfig.server.build.inlineCss.enabled,
        )
        cssCodeSplitDisabledFileName = getAssetFileNameByName(
          bundle,
          'style.css',
        )
      },
    },
    createVirtualModule({
      name: 'tanstack-start:start-manifest-plugin',
      moduleId: VIRTUAL_MODULES.startManifest,
      enforce: 'pre',
      load() {
        const { resolvedStartConfig, startConfig } = opts.getConfig()
        const bundledDev = isClientBundledDev(this.environment)
        const clientEntry = getDevClientEntry({
          basePath: resolvedStartConfig.basePaths.publicBase,
          bundledDev,
        })

        const devRuntime =
          bundledDev && hasSeparateBundledDevRuntime()
            ? joinURL(
                resolvedStartConfig.basePaths.publicBase,
                'bundledDevClient.mjs',
              )
            : undefined

        if (this.environment.name !== START_ENVIRONMENT_NAMES.server) {
          return getEmptyStartManifestModule(clientEntry, devRuntime)
        }

        if (this.environment.config.command === 'serve') {
          return getEmptyStartManifestModule(clientEntry, devRuntime)
        }

        const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
        // TODO this needs further discussion with vite-rsc, this is a temporary workaround
        // If the client bundle isn't available yet (e.g., during RSC scan builds),
        // return a dummy manifest. The real manifest will be generated in the actual build.
        if (!clientBuild) {
          return getEmptyStartManifestModule(clientEntry, devRuntime)
        }
        const startManifest = buildStartManifest({
          clientBuild,
          routeTreeRoutes,
          basePath: resolvedStartConfig.basePaths.publicBase,
          inlineCss: startConfig.server.build.inlineCss,
          additionalRouteAssets: getViteAdditionalRouteAssets({
            cssCodeSplitDisabledFileName,
            basePath: resolvedStartConfig.basePaths.publicBase,
            cssCodeSplit: this.environment.config.build.cssCodeSplit,
          }),
        })

        return `export const tsrStartManifest = () => (${serializeStartManifest(startManifest)})`
      },
    }),
  ]
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

  const { getStylesheetLink } = createManifestAssetResolvers(options.basePath)

  return {
    [rootRouteId]: [getStylesheetLink(options.cssCodeSplitDisabledFileName)],
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

function getEmptyStartManifestModule(clientEntry: string, devRuntime?: string) {
  // Start renders its own HTML, bypassing Vite's runtime script injection.
  // Load the runtime before evaluating the bundled entry, which uses its globals.
  const scripts = devRuntime
    ? [
        {
          attrs: { type: 'module', async: true },
          children: `await import(${JSON.stringify(devRuntime)});\nawait import(${JSON.stringify(clientEntry)});`,
        },
      ]
    : [{ attrs: { type: 'module', async: true, src: clientEntry } }]

  return `export const tsrStartManifest = () => ({
      routes: {
        __root__: {
          preloads: ['${clientEntry}'],
          scripts: ${JSON.stringify(scripts)},
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

function hasSeparateBundledDevRuntime() {
  // Vite 8.2.1 moved the runtime out of the entry bundle. Older Vite versions
  // still inject it there and do not serve bundledDevClient.mjs separately.
  const [major = 0, minor = 0, patch = 0] = viteVersion.split('.').map(Number)
  return (
    major > 8 || (major === 8 && (minor > 2 || (minor === 2 && patch >= 1)))
  )
}
