import { unpluginRouterCodeSplitter } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGenerator } from './router-generator'

import type { Config } from './config'
import type { VitePlugin } from 'unplugin'

const TanStackRouterGeneratorVite = unpluginRouterGenerator.vite
const TanStackRouterCodeSplitterVite = unpluginRouterCodeSplitter.vite

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
