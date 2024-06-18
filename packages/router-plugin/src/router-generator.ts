import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'

import type { PluginOptions } from './config'

export const routerGeneratorUnpluginFactory: UnpluginFactory<PluginOptions> = (
  options,
) => {
  return {
    name: 'router-generator-plugin',
  }
}

export const unpluginRouterGenerator = /* #__PURE__ */ createUnplugin(
  routerGeneratorUnpluginFactory,
)
