import { unpluginRouterGeneratorFactory } from './router-generator-plugin'
import { unpluginRouterCodeSplitterFactory } from './router-code-splitter-plugin'
import type { ConfigOptions } from './config'

import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  ConfigOptions | undefined
> = (options = {}, meta) => {
  const routerGenerator = unpluginRouterGeneratorFactory(options, meta)

  const routerGeneratorOptions = Array.isArray(routerGenerator)
    ? routerGenerator
    : [routerGenerator]

  const routerCodeSplitter = unpluginRouterCodeSplitterFactory(options, meta)
  const routerCodeSplitterOptions = Array.isArray(routerCodeSplitter)
    ? routerCodeSplitter
    : [routerCodeSplitter]

  return [...routerGeneratorOptions, ...routerCodeSplitterOptions]
}
