import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
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

/** The part of a Vitest project that a plugin may change. */
interface VitestProject {
  config: { setupFiles: Array<string> }
}

/** Vitest calls this hook of a Vite plugin for each of its projects. */
interface VitestPluginHooks {
  configureVitest?: (context: { project: VitestProject }) => void
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
  const plugin: Plugin & VitestPluginHooks = {
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
  return plugin
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
