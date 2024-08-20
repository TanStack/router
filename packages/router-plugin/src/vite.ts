import { createVitePlugin } from 'unplugin'

import { configSchema } from './core/config'
import { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
import { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
import { unpluginRouterComposedFactory } from './core/router-composed-plugin'

import type { Config } from './core/config'

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
