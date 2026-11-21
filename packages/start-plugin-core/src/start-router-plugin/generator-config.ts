import path from 'pathe'
import { buildRouteTreeFileFooterFromConfig } from './route-tree-footer'
import { routesManifestPlugin } from './generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from './generator-plugins/prerender-routes-plugin'
import type { GeneratorPlugin } from '@tanstack/router-generator'
import type { Config } from '@tanstack/router-plugin'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'

/**
 * The route generator configuration of a Start app, the same for the Vite
 * and Rsbuild plugins: the app's router options as the Start config parsed
 * them, the framework's target, Start's route tree footer (the router and
 * Start config types, then the app's own lines; computed at every print, as
 * a router app's function-form `routeTreeFileFooter` is), and the generator
 * plugins: the client route tree, the routes manifest, prerendering when
 * enabled, and the app's own (#7768).
 */
export function startGeneratorConfig(opts: {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartCoreOptions
  prerender: boolean
  clientRouteTree: GeneratorPlugin
}): Config {
  const router = opts.getConfig().startConfig.router
  return {
    ...router,
    target: opts.corePluginOpts.framework,
    routeTreeFileFooter: () =>
      buildRouteTreeFileFooterFromConfig({
        generatedRouteTreePath: path.resolve(router.generatedRouteTree),
        getConfig: opts.getConfig,
        corePluginOpts: opts.corePluginOpts,
      }),
    plugins: [
      opts.clientRouteTree,
      routesManifestPlugin(),
      ...(opts.prerender ? [prerenderRoutesPlugin()] : []),
      ...(router.plugins ?? []),
    ],
  }
}
