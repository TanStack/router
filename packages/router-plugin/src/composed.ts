import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'

import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

export const unpluginRouterComposedFactory: UnpluginFactory<
  Partial<Config> | undefined
> = (options = {}, meta) => {
  const codeSplitterResult = unpluginRouterCodeSplitterFactory(options, meta)
  const generatorResult = unpluginRouterGeneratorFactory(options, meta)

  const codeSplitter = Array.isArray(codeSplitterResult)
    ? codeSplitterResult
    : [codeSplitterResult]
  const generator = Array.isArray(generatorResult)
    ? generatorResult
    : [generatorResult]

  return [...codeSplitter, ...generator]
}
