import { describe, expect, test, vi } from 'vitest'
import { devServerPlugin } from '../../src/vite/dev-server-plugin/plugin'
import { VITE_ENVIRONMENT_NAMES } from '../../src/constants'
import type { GetConfigFn } from '../../src/types'

/**
 * A runnable SSR environment created by a *different* copy of vite than the one
 * this plugin imports, as happens with Vite+ or a duplicated vite install.
 * It is structurally a RunnableDevEnvironment, but `instanceof` against our copy
 * of vite is false, so `isRunnableDevEnvironment()` rejects it.
 */
class ForeignRunnableDevEnvironment {
  get runner() {
    return { import: () => Promise.resolve({}) }
  }
}

function runDevServerPlugin({
  serverEnv,
  installDevServerMiddleware,
}: {
  serverEnv: unknown
  installDevServerMiddleware?: boolean
}) {
  const warn = vi.fn()
  const use = vi.fn()
  const viteDevServer = {
    config: {
      server: { middlewareMode: false },
      experimental: { bundledDev: false },
      logger: { warn },
    },
    environments: { [VITE_ENVIRONMENT_NAMES.server]: serverEnv },
    middlewares: { use },
    watcher: { add: vi.fn() },
  }

  const [plugin] = devServerPlugin({
    getConfig: (() => ({})) as unknown as GetConfigFn,
    devSsrStylesEnabled: false,
    installDevServerMiddleware,
  }) as Array<any>

  const postHook = plugin.configureServer(viteDevServer as any)
  postHook?.()

  return { warn, use }
}

describe('dev server plugin middleware installation', () => {
  test('installs the middleware for a runnable SSR environment from another vite instance', () => {
    const { use, warn } = runDevServerPlugin({
      serverEnv: new ForeignRunnableDevEnvironment(),
    })

    expect(use).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  test('does not throw when opting in with a runnable environment from another vite instance', () => {
    expect(() =>
      runDevServerPlugin({
        serverEnv: new ForeignRunnableDevEnvironment(),
        installDevServerMiddleware: true,
      }),
    ).not.toThrow()
  })

  test('warns instead of silently skipping when the SSR environment cannot render', () => {
    const { use, warn } = runDevServerPlugin({ serverEnv: {} })

    expect(use).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('installDevServerMiddleware')
  })

  test('stays silent when another plugin already serves the SSR environment', () => {
    const { use, warn } = runDevServerPlugin({
      serverEnv: { dispatchFetch: () => Promise.resolve(new Response()) },
    })

    expect(use).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})
