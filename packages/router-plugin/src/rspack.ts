import { createRspackPlugin } from 'unplugin'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterComposedFactory } from './composed'
import type { Config } from './config'

const TanStackRouterGeneratorRspack = createRspackPlugin(
  unpluginRouterGeneratorFactory,
)
const TanStackRouterCodeSplitterRspack = createRspackPlugin(
  unpluginRouterCodeSplitterFactory,
)
const TanStackRouterRspack = createRspackPlugin(unpluginRouterComposedFactory)

export default TanStackRouterRspack
export {
  configSchema,
  TanStackRouterRspack,
  TanStackRouterGeneratorRspack,
  TanStackRouterCodeSplitterRspack,
}
export type { Config }
