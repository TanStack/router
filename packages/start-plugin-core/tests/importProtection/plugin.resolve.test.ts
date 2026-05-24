import { describe, expect, test, vi } from 'vitest'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'

describe('importProtectionPlugin resolveId', () => {
  test('returns the nested resolver result when a resolved import is allowed', async () => {
    const root = '/repo'
    const plugin = createPlugin(root)
    const resolved = {
      id: `${root}/src/feature.ts`,
      meta: { source: 'next-plugin' },
      moduleSideEffects: false,
    }
    const resolve = vi.fn(async () => resolved)
    const importer = `${root}/src/app.ts`
    const options = {
      attributes: { type: 'json' },
      custom: { test: true },
      isEntry: false,
    }

    const result = await plugin.resolveId.handler.call(
      {
        environment: { name: 'client' },
        resolve,
        warn: vi.fn(),
        error(message: string) {
          throw new Error(message)
        },
      },
      './feature',
      importer,
      options,
    )

    expect(result).toBe(resolved)
    expect(resolve).toHaveBeenCalledWith('./feature', importer, {
      ...options,
      skipSelf: true,
    })
  })
})

function createPlugin(root: string): any {
  const plugins = importProtectionPlugin({
    framework: 'react',
    providerEnvName: 'ssr',
    environments: [{ name: 'client', type: 'client' }],
    getConfig: () =>
      ({
        startConfig: {},
        resolvedStartConfig: {
          root,
          srcDirectory: `${root}/src`,
          routerFilePath: `${root}/src/router.tsx`,
          startFilePath: undefined,
          basePaths: {},
          outputDirectories: {},
        },
      }) as any,
  }) as Array<any>

  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start-core:import-protection',
  )!

  plugin.configResolved({
    root,
    command: 'build',
    experimental: { bundledDev: false },
  })

  return plugin
}
