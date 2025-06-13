import { unpluginRouterGeneratorFactory } from './router-generator-plugin'
import { unpluginRouterCodeSplitterFactory } from './router-code-splitter-plugin'
import { unpluginRouterHmrFactory } from './router-hmr-plugin'
import { unpluginRouteAutoImportFactory } from './route-autoimport-plugin'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, meta) => {
  const getPlugin = (pluginFactory: UnpluginFactory<Partial<Config>>) => {
    const plugin = pluginFactory(options, meta)
    if (!Array.isArray(plugin)) {
      return [plugin]
    }
    return plugin
  }

  const routerGenerator = getPlugin(unpluginRouterGeneratorFactory)
  const routerCodeSplitter = getPlugin(unpluginRouterCodeSplitterFactory)
  const routeAutoImport = getPlugin(unpluginRouteAutoImportFactory)

  const result = [...routerGenerator]
  if (options.autoCodeSplitting) {
    result.push(...routerCodeSplitter)
  }
  if (options.verboseFileRoutes === false) {
    result.push(...routeAutoImport)
  }

  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction && !options.autoCodeSplitting) {
    const routerHmr = getPlugin(unpluginRouterHmrFactory)
    result.push(...routerHmr)
  }
  return result
}
