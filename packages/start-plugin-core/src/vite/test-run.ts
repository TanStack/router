import { ENTRY_POINTS } from '../constants'
import { isVitestRun } from '../test-mode'
import { createVirtualModule } from './createVirtualModule'
import type { Plugin, PluginOption } from 'vite'

/**
 * Leaves the given plugins out of a config that Vitest resolves to run
 * tests. They serve or build the app, which a test run does not do.
 */
export function excludeFromTestRuns(option: PluginOption): PluginOption {
  if (Array.isArray(option)) {
    return option.map(excludeFromTestRuns)
  }
  if (!option) {
    return option
  }
  if (option instanceof Promise) {
    return option.then(excludeFromTestRuns)
  }

  const plugin = option as Plugin
  const apply = plugin.apply
  return {
    ...plugin,
    apply(config, env) {
      if (isVitestRun(env)) {
        return false
      }
      if (typeof apply === 'function') {
        return apply.call(this, config, env)
      }
      return apply === undefined || apply === env.command
    },
  }
}

/**
 * Answers the import of the router entry in a test run of a project that has
 * none, such as a package that only uses Start's compile-time APIs. Start's
 * server code imports the entry, and without an answer Vite fails to load
 * that code at all. A project with a router entry has an alias for the
 * import, which wins over this placeholder.
 */
export function testRunRouterEntryPlugin(): Plugin {
  return createVirtualModule({
    name: 'tanstack-start-core:test-run-router-entry',
    moduleId: ENTRY_POINTS.router,
    enforce: 'pre',
    apply: (_config, env) => isVitestRun(env),
    load: () => 'export function getRouter() {}\n',
  })
}
