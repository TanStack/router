import { joinURL } from 'ufo'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { rootRouteId } from '@tanstack/router-core'
import { ENTRY_POINTS, START_ENVIRONMENT_NAMES } from '../../constants'
import {
  buildStartManifest,
  createManifestAssetResolvers,
  normalizeViteClientBuild,
  serializeStartManifest,
} from '../../start-manifest-plugin/manifestBuilder'
import { createVirtualModule } from '../createVirtualModule'
import type { GetConfigFn, NormalizedClientBuild } from '../../types'
import type { PluginOption, Rollup } from 'vite'

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

        clientBuild = normalizeViteClientBuild(bundle)
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
        const { resolvedStartConfig } = opts.getConfig()
        const clientEntry = joinURL(
          resolvedStartConfig.basePaths.publicBase,
          '@id',
          ENTRY_POINTS.client,
        )

        if (this.environment.name !== START_ENVIRONMENT_NAMES.server) {
          return getEmptyStartManifestModule(clientEntry)
        }

        if (this.environment.config.command === 'serve') {
          return getEmptyStartManifestModule(clientEntry)
        }

        const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
        // TODO this needs further discussion with vite-rsc, this is a temporary workaround
        // If the client bundle isn't available yet (e.g., during RSC scan builds),
        // return a dummy manifest. The real manifest will be generated in the actual build.
        if (!clientBuild) {
          return getEmptyStartManifestModule(clientEntry)
        }
        const startManifest = buildStartManifest({
          clientBuild,
          routeTreeRoutes,
          basePath: resolvedStartConfig.basePaths.publicBase,
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

  const { getStylesheetAsset } = createManifestAssetResolvers(options.basePath)

  return {
    [rootRouteId]: [getStylesheetAsset(options.cssCodeSplitDisabledFileName)],
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

function getEmptyStartManifestModule(clientEntry: string) {
  return `export const tsrStartManifest = () => ({
      routes: {},
      clientEntry: '${clientEntry}',
    })`
}
