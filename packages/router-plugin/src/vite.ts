import { createVitePlugin } from 'unplugin'
import { unpluginRouterCodeSplitterFactory } from './code-splitter'
import { configSchema } from './config'
import { unpluginRouterGeneratorFactory } from './router-generator'
import { unpluginRouterComposedFactory } from './composed'

import type { Config } from './config'

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [TanStackRouterGeneratorVite()],
 *   // ...
 * })
 * ```
 */
const TanStackRouterGeneratorVite = createVitePlugin(
  unpluginRouterGeneratorFactory,
)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [TanStackRouterCodeSplitterVite()],
 *   // ...
 * })
 * ```
 */
const TanStackRouterCodeSplitterVite = createVitePlugin(
  unpluginRouterCodeSplitterFactory,
)

/**
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [TanStackRouterVite()],
 *   // ...
 * })
 * ```
 */
const TanStackRouterVite = createVitePlugin(unpluginRouterComposedFactory)

export default TanStackRouterVite
export {
  configSchema,
  TanStackRouterGeneratorVite,
  TanStackRouterCodeSplitterVite,
  TanStackRouterVite,
}
export type { Config }
