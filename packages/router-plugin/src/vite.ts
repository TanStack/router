import { createVitePlugin } from 'unplugin'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'

import type { Config } from './config'
import type { VitePlugin } from 'unplugin'

const TanStackRouterGeneratorVite = createVitePlugin(
  unpluginRouterGeneratorFactory,
)
const TanStackRouterCodeSplitterVite = createVitePlugin(
  unpluginRouterCodeSplitterFactory,
)

function TanStackRouterVite(inlineConfig?: Partial<Config>): Array<VitePlugin> {
  return [
    TanStackRouterGeneratorVite(inlineConfig) as VitePlugin,
    TanStackRouterCodeSplitterVite(inlineConfig) as VitePlugin,
  ]
}

export default TanStackRouterVite
export {
  configSchema,
  TanStackRouterGeneratorVite,
  TanStackRouterCodeSplitterVite,
  TanStackRouterVite,
}
export type { Config }
