import { createUnplugin, type UnpluginFactory } from 'unplugin'

import { routerCodeSplitterUnpluginFactory } from './code-splitter'
import { routerGeneratorUnpluginFactory } from './router-generator'
import type { PluginOptions } from './config'

export const routerUnpluginFactory: UnpluginFactory<PluginOptions> = () => {
  return [routerCodeSplitterUnpluginFactory, routerGeneratorUnpluginFactory]
}

export const unpluginRouter = /* #__PURE__ */ createUnplugin(
  routerUnpluginFactory,
)
