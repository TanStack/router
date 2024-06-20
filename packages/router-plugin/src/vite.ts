import { createVitePlugin } from 'unplugin'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterComposedFactory } from './composed'

import type { Config } from './config'

const TanStackRouterGeneratorVite = createVitePlugin(
  unpluginRouterGeneratorFactory,
)
const TanStackRouterCodeSplitterVite = createVitePlugin(
  unpluginRouterCodeSplitterFactory,
)
const TanStackRouterVite = createVitePlugin(unpluginRouterComposedFactory)

export default TanStackRouterVite
export {
  configSchema,
  TanStackRouterGeneratorVite,
  TanStackRouterCodeSplitterVite,
  TanStackRouterVite,
}
export type { Config }
