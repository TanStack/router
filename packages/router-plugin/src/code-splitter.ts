import { createUnplugin, type UnpluginFactory } from 'unplugin'

import type { PluginOptions } from './config'

export const routerCodeSplitterUnpluginFactory: UnpluginFactory<
  PluginOptions
> = (options) => {
  return {
    name: 'router-code-splitter-plugin',
  }
}

export const unpluginRouterCodeSplitter = /* #__PURE__ */ createUnplugin(
  routerCodeSplitterUnpluginFactory,
)
