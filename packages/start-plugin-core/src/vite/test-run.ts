import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
import { ENTRY_POINTS } from '../constants'
import { isVitestRun } from '../test-mode'
import { createVirtualModule } from './createVirtualModule'
import type { Plugin, PluginOption } from 'vite'
// (Vitest adds the `configureVitest` hook to Vite's `Plugin`)
import type {} from 'vitest/config'

/**
 * Leaves the given plugins out of a config that Vitest resolves to run
 * tests. They serve the app, which a test run does not do. The plugins must
 * not have an `apply` of their own: it would be replaced.
 */
export function excludeFromTestRuns(option: PluginOption): PluginOption {
  if (Array.isArray(option)) {
    return option.map(excludeFromTestRuns)
  }
  return { ...(option as Plugin), apply: (_config, env) => !isVitestRun(env) }
}

/**
 * Adds Start's setup file to every Vitest project of a test run. The file
 * ends the mocks of `mockServerFn` and `mockMiddleware` with the test that
 * registered them.
 *
 * The file goes in through `configureVitest`, because `test.setupFiles`
 * returned from the `config` hook only reaches a browser project.
 */
export function vitestSetupFilePlugin(isTestRun: () => boolean): Plugin {
  return {
    name: 'tanstack-start-core:vitest-setup-file',
    configureVitest({ project }) {
      if (!isTestRun()) {
        return
      }
      const setupFile = normalizePath(
        fileURLToPath(
          import.meta.resolve('@tanstack/start-client-core/testing/vitest'),
        ),
      )
      if (!project.config.setupFiles.includes(setupFile)) {
        project.config.setupFiles.push(setupFile)
      }
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
