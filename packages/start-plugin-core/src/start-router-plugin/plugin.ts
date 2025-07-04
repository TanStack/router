/*
what is this plugin doing, especially compared to one already existing in the @tanstack/router-plugin package?

it configures:
1. the generator to generate both the render-route-tree as well as the server-route-tree
2. the code-splitter plugin, so it could possibly be enabled per environment (e.g. disable on the server)
3. the auto import plugin for both environments
4. the route tree client plugin, which removes the server part from the generated route tree
5. the virtual route tree plugin, which provides the route tree to the server
*/

import {
  tanStackRouterCodeSplitter,
  tanstackRouterAutoImport,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/vite'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { routeTreeClientPlugin } from './route-tree-client-plugin'
import { virtualRouteTreePlugin } from './virtual-route-tree-plugin'
import { routesManifestPlugin } from './generator-plugins/routes-manifest-plugin'
import { serverRoutesPlugin } from './generator-plugins/server-routes-plugin'
import type { PluginOption } from 'vite'
import type { Config } from '@tanstack/router-plugin'

export function tanStackStartRouter(config: Config): Array<PluginOption> {
  return [
    tanstackRouterGenerator({
      ...config,
      plugins: [serverRoutesPlugin(), routesManifestPlugin()],
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
      },
    }),
    tanStackRouterCodeSplitter({
      ...config,
      codeSplittingOptions: {
        ...config.codeSplittingOptions,
        deleteNodes: ['ssr'],
        addHmr: true,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
      },
    }),
    tanStackRouterCodeSplitter({
      ...config,
      codeSplittingOptions: {
        ...config.codeSplittingOptions,
        addHmr: false,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.server },
      },
    }),
    tanstackRouterAutoImport(config),
    routeTreeClientPlugin(config),
    virtualRouteTreePlugin(config),
  ]
}
