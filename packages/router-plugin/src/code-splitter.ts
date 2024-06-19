import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'

import type { PluginOptions } from './config'

export const unpluginFactory: UnpluginFactory<Partial<PluginOptions>> = (
  options = {},
) => {
  return {
    name: 'router-code-splitter-plugin',
  }
}

export const unpluginRouterCodeSplitter =
  /* #__PURE__ */ createUnplugin(unpluginFactory)
