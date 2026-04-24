import { getConfig } from '@tanstack/router-generator'
import { unpluginRouterGeneratorFactory } from './router-generator-plugin'
import { unpluginRouterCodeSplitterFactory } from './router-code-splitter-plugin'
import { unpluginRouterHmrFactory } from './router-hmr-plugin'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  Partial<Config | (() => Config)> | undefined
> = (options = {}, meta) => {
  const ROOT: string = process.cwd()
  const userConfig = getConfig(
    (typeof options === 'function' ? options() : options) as Partial<Config>,
    ROOT,
  )

  const getPlugin = (
    pluginFactory: UnpluginFactory<Partial<Config | (() => Config)>>,
  ) => {
    const plugin = pluginFactory(options, meta)
    if (!Array.isArray(plugin)) {
      return [plugin]
    }
    return plugin
  }

  const routerGenerator = getPlugin(unpluginRouterGeneratorFactory)
  const routerCodeSplitter = getPlugin(unpluginRouterCodeSplitterFactory)

  const result = [
    {
      name: 'tanstack:router-inline-css-defaults',
      vite: {
        config() {
          return {
            define: {
              'process.env.TSS_INLINE_CSS_ENABLED': JSON.stringify('false'),
              'import.meta.env.TSS_INLINE_CSS_ENABLED': JSON.stringify('false'),
            },
          }
        },
      },
    },
    ...routerGenerator,
  ]
  if (userConfig.autoCodeSplitting) {
    result.push(...routerCodeSplitter)
  }

  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction && !userConfig.autoCodeSplitting) {
    const routerHmr = getPlugin(unpluginRouterHmrFactory)
    result.push(...routerHmr)
  }
  return result
}
