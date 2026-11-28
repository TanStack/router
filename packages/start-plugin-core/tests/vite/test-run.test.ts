import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  excludeFromTestRuns,
  testRunRouterEntryPlugin,
} from '../../src/vite/test-run'
import type { ConfigEnv, Plugin } from 'vite'

const testRun: ConfigEnv = { command: 'serve', mode: 'test' }
const devServer: ConfigEnv = { command: 'serve', mode: 'development' }
const build: ConfigEnv = { command: 'build', mode: 'production' }

/** Whether Vite applies the plugin for `env`, as Vite decides it. */
function applies(plugin: Plugin, env: ConfigEnv) {
  if (!plugin.apply) {
    return true
  }
  if (typeof plugin.apply === 'function') {
    return plugin.apply({}, env)
  }
  return plugin.apply === env.command
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('excludeFromTestRuns', () => {
  test('leaves plugins out of a test run and keeps them everywhere else', () => {
    vi.stubEnv('VITEST', 'true')
    const plugins = (
      excludeFromTestRuns([{ name: 'first' }, [{ name: 'nested' }]]) as Array<
        Plugin | Array<Plugin>
      >
    ).flat()

    expect(plugins.map((plugin) => plugin.name)).toEqual(['first', 'nested'])
    for (const plugin of plugins) {
      expect(applies(plugin, testRun)).toBe(false)
      expect(applies(plugin, devServer)).toBe(true)
      expect(applies(plugin, build)).toBe(true)
    }
  })
})

/** Calls a hook of a plugin, whether it is a function or has a handler. */
function callHook(hook: unknown, ...args: Array<unknown>): unknown {
  const handler =
    typeof hook === 'function'
      ? hook
      : (hook as { handler: (...args: Array<unknown>) => unknown }).handler
  return handler.call({}, ...args)
}

describe('testRunRouterEntryPlugin', () => {
  test('applies to a test run only', () => {
    vi.stubEnv('VITEST', 'true')
    const plugin = testRunRouterEntryPlugin()

    expect(applies(plugin, testRun)).toBe(true)
    expect(applies(plugin, devServer)).toBe(false)
    expect(applies(plugin, build)).toBe(false)
  })

  test('answers the import of the router entry with an entry that has no router', () => {
    const plugin = testRunRouterEntryPlugin()

    const resolved = callHook(plugin.resolveId, '#tanstack-router-entry')
    expect(resolved).toBeTypeOf('string')
    expect(callHook(plugin.resolveId, '#tanstack-start-entry')).toBeUndefined()

    expect(callHook(plugin.load, resolved)).toBe(
      'export function getRouter() {}\n',
    )
  })
})
