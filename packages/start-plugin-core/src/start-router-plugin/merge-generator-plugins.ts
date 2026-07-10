import type { GeneratorPlugin } from '@tanstack/router-generator'

/**
 * Build the generator plugin list for Start, keeping Start's internal
 * plugins first and appending any user-supplied router.plugins.
 *
 * Without this merge, `plugins: internal` overwrites `...routerConfig.plugins`
 * when the config object is assembled for tanstackRouterGenerator.
 */
export function mergeStartGeneratorPlugins(
  internal: Array<GeneratorPlugin>,
  userPlugins?: Array<GeneratorPlugin> | null,
): Array<GeneratorPlugin> {
  if (!userPlugins?.length) {
    return internal
  }
  return [...internal, ...userPlugins]
}
