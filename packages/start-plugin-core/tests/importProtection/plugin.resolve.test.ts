import { describe, expect, test, vi } from 'vitest'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'

describe('importProtectionPlugin', () => {
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

  test('keeps bundled-dev client violations pending until route importers are known', async () => {
    const root = '/repo'
    const { plugin, transformCachePlugin } = createPlugins(root, {
      command: 'serve',
      bundledDev: true,
    })
    plugin.buildStart()

    const routeFile = `${root}/src/routes/leak.tsx`
    const deniedFile = `${root}/src/lib/secret.server.ts`
    const warn = vi.fn()
    const resolve = vi.fn(async (source: string) =>
      source === '../lib/secret.server' ? { id: deniedFile } : null,
    )

    await transformCachePlugin.transform.handler.call(
      {
        environment: { name: 'client' },
        resolve,
        warn,
        error(message: string) {
          throw new Error(message)
        },
        getCombinedSourcemap: () => null,
      },
      `import { secret } from '../lib/secret.server'
export const value = secret
`,
      routeFile,
    )

    expect(warn).not.toHaveBeenCalled()
  })
})

function createPlugin(root: string): any {
  return createPlugins(root).plugin
}

function createPlugins(
  root: string,
  opts: {
    command?: 'build' | 'serve'
    bundledDev?: boolean
  } = {},
): { plugin: any; transformCachePlugin: any } {
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
  const transformCachePlugin = plugins.find(
    (item) =>
      item.name === 'tanstack-start-core:import-protection-transform-cache',
  )!

  plugin.configResolved({
    root,
    command: opts.command ?? 'build',
    experimental: { bundledDev: opts.bundledDev ?? false },
  })

  return { plugin, transformCachePlugin }
}
