import { existsSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  excludeFromTestRuns,
  testRunRouterEntryPlugin,
  vitestSetupFilePlugin,
} from '../../src/vite/test-run'
import type { ConfigEnv, Plugin, PluginOption } from 'vite'

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

async function flatten(option: PluginOption): Promise<Array<Plugin>> {
  const resolved = await option
  if (!resolved) {
    return []
  }
  if (Array.isArray(resolved)) {
    return (await Promise.all(resolved.map(flatten))).flat()
  }
  return [resolved as Plugin]
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('excludeFromTestRuns', () => {
  test('leaves a plugin out of a test run and keeps it everywhere else', async () => {
    vi.stubEnv('VITEST', 'true')
    const [plugin] = await flatten(excludeFromTestRuns({ name: 'serves-app' }))

    expect(applies(plugin!, testRun)).toBe(false)
    expect(applies(plugin!, devServer)).toBe(true)
    expect(applies(plugin!, build)).toBe(true)
  })

  test('keeps the command a plugin applies to', async () => {
    vi.stubEnv('VITEST', 'true')
    const [plugin] = await flatten(
      excludeFromTestRuns({ name: 'builds-app', apply: 'build' }),
    )

    expect(applies(plugin!, testRun)).toBe(false)
    expect(applies(plugin!, devServer)).toBe(false)
    expect(applies(plugin!, build)).toBe(true)
  })

  test("keeps a plugin's own decision outside a test run", async () => {
    vi.stubEnv('VITEST', 'true')
    const [plugin] = await flatten(
      excludeFromTestRuns({
        name: 'production-only',
        apply: (_config, env) => env.mode === 'production',
      }),
    )

    expect(applies(plugin!, testRun)).toBe(false)
    expect(applies(plugin!, devServer)).toBe(false)
    expect(applies(plugin!, build)).toBe(true)
  })

  test('reaches the plugins inside arrays and promises, and keeps empty entries', async () => {
    vi.stubEnv('VITEST', 'true')
    const option = excludeFromTestRuns([
      { name: 'first' },
      null,
      false,
      [{ name: 'nested' }, Promise.resolve({ name: 'later' })],
    ])

    const plugins = await flatten(option)
    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'first',
      'nested',
      'later',
    ])
    expect(plugins.map((plugin) => applies(plugin, testRun))).toEqual([
      false,
      false,
      false,
    ])
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

describe('vitestSetupFilePlugin', () => {
  type ConfigureVitest = (context: {
    project: { config: { setupFiles: Array<string> } }
  }) => void

  function configureVitest(isTestRun: boolean, setupFiles: Array<string>) {
    const plugin = vitestSetupFilePlugin(() => isTestRun) as Plugin & {
      configureVitest: ConfigureVitest
    }
    plugin.configureVitest({ project: { config: { setupFiles } } })
  }

  test('adds the setup file of Start after the ones of the project, once', () => {
    const setupFiles = ['/project/tests/setup.ts']

    configureVitest(true, setupFiles)
    configureVitest(true, setupFiles)

    expect(setupFiles).toHaveLength(2)
    expect(setupFiles[0]).toBe('/project/tests/setup.ts')
    expect(setupFiles[1]).toMatch(/start-client-core\/.*testing\/vitest\.js$/)
    expect(existsSync(setupFiles[1]!)).toBe(true)
  })

  test('leaves a project alone outside of a test run', () => {
    const setupFiles: Array<string> = []

    configureVitest(false, setupFiles)

    expect(setupFiles).toEqual([])
  })
})
