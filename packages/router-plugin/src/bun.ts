import { createBunPlugin } from 'unplugin'
import { configSchema } from './core/config'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'
import type { BunPlugin } from 'unplugin'
import type { Config } from './core/config'

type RouterPluginOptions = Partial<Config | (() => Config)> | undefined

const TanStackRouterBun = (options?: RouterPluginOptions): BunPlugin => ({
  name: 'tanstack-router',
  setup(build) {
    // A plugin can be reused by overlapping builds; compiler state is build-local.
    return createBunPlugin(unpluginRouterComposedFactory)(options).setup(build)
  },
})
const tanstackRouter = TanStackRouterBun

export default TanStackRouterBun
export { configSchema, TanStackRouterBun, tanstackRouter }
export type { CodeSplittingOptions, Config } from './core/config'
