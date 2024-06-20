import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'

import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, meta) => {
  const generatorResult = unpluginRouterGeneratorFactory(options, meta)

  const generator = Array.isArray(generatorResult)
    ? generatorResult
    : [generatorResult]

  const codeSplitterResult = unpluginRouterCodeSplitterFactory(options, meta)
  const codeSplitter =
    meta.framework === 'rspack'
      ? []
      : Array.isArray(codeSplitterResult)
        ? codeSplitterResult
        : [codeSplitterResult]

  return [...generator, ...codeSplitter]
}
