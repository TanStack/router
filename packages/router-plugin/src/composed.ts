import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'

import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, meta) => {
  const routerGenerator = unpluginRouterGeneratorFactory(options, meta)

  const routerGeneratorOptions = Array.isArray(routerGenerator)
    ? routerGenerator
    : [routerGenerator]

  const routerCodeSplitter = unpluginRouterCodeSplitterFactory(options, meta)
  let routerCodeSplitterOptions = Array.isArray(routerCodeSplitter)
    ? routerCodeSplitter
    : [routerCodeSplitter]

  // Rspack doesn't support the `resolveId` and `transform` hooks provided by unplugin
  // so we need to disable the code splitter for it
  // If you're using Rspack, and know how to implement the code splitting, please let us know
  // We'd love to support it, but we're not sure how to do it yet
  if (meta.framework === 'rspack') {
    routerCodeSplitterOptions = []
  }

  return [...routerGeneratorOptions, ...routerCodeSplitterOptions]
}
