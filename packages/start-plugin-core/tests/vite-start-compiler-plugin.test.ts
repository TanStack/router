import crypto from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@tanstack/start-server-core', () => ({
  VIRTUAL_MODULES: {
    serverFnResolver: 'virtual:tanstack-start-server-fn-resolver',
  },
}))

import {
  SERVER_FN_LOOKUP,
  startCompilerPlugin,
} from '../src/vite/start-compiler-plugin/plugin'
import {
  createViteDevServerFnModuleSpecifierEncoder,
  decodeViteDevServerModuleSpecifier,
} from '../src/vite/start-compiler-plugin/module-specifier'
import { mergeHotUpdateModules } from '../src/vite/start-compiler-plugin/hot-update'
import type { Plugin } from 'vite'
import type { EnvironmentModuleNode } from 'vite'

describe('Vite dev server module specifiers', () => {
  test('encodes app files as root-relative dev server paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/app/src/routes/index.tsx',
      root: '/repo/app',
    })

    expect(specifier).toBe('/src/routes/index.tsx')
    expect(decodeViteDevServerModuleSpecifier(specifier)).toBe(
      'src/routes/index.tsx',
    )
  })

  test('preserves POSIX absolute /@fs paths outside the app root', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/shared/server-fn.ts',
      root: '/repo/app',
    })

    expect(specifier).toBe('/@fs/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      '/repo/shared/server-fn.ts',
    )
  })

  test('preserves Windows drive-letter /@fs paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('C:/repo/app')

    const specifier = encode({
      extractedFilename: 'D:/repo/shared/server-fn.ts',
      root: 'C:/repo/app',
    })

    expect(specifier).toBe('/@fs/D:/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      'D:/repo/shared/server-fn.ts',
    )
  })
})

describe('mergeHotUpdateModules', () => {
  test('returns undefined when no extra modules were added', () => {
    const current = [{ id: '/src/route.tsx' }] as Array<EnvironmentModuleNode>

    expect(mergeHotUpdateModules(current, [])).toBeUndefined()
  })

  test('keeps native Vite modules and appends extra modules without duplicates', () => {
    const route = { id: '/src/route.tsx' } as EnvironmentModuleNode
    const provider = {
      id: '/src/route.tsx?tss-serverfn-split',
    } as EnvironmentModuleNode

    expect(mergeHotUpdateModules([route], [route, provider])).toEqual([
      route,
      provider,
    ])
  })
})

describe('startCompilerPlugin Vite hotUpdate', () => {
  test('invalidates server function modules without assuming an in-process runner', async () => {
    const plugins = startCompilerPlugin({
      framework: 'react',
      providerEnvName: 'ssr',
      environments: [{ name: 'ssr', type: 'server' }],
    }) as Array<Plugin>
    const plugin = plugins.find(
      (candidate) => candidate.name === 'tanstack-start-core::server-fn:ssr',
    )!

    const changedModule = {
      id: '/src/routes/index.tsx',
      importers: new Set<EnvironmentModuleNode>(),
    } as EnvironmentModuleNode
    const providerModule = {
      id: '/src/routes/index.tsx?tss-serverfn-split',
      importers: new Set<EnvironmentModuleNode>(),
    } as EnvironmentModuleNode
    const lookupModule = {
      id: `/src/routes/index.tsx?${SERVER_FN_LOOKUP}`,
      importers: new Set<EnvironmentModuleNode>(),
    } as EnvironmentModuleNode
    const invalidatedModules: Array<EnvironmentModuleNode> = []

    const result = await (plugin.hotUpdate as any).call(
      {
        environment: {
          name: 'ssr',
          mode: 'dev',
          moduleGraph: {
            getModulesByFile(file: string) {
              if (file === '/src/routes/index.tsx') {
                return new Set([changedModule, providerModule, lookupModule])
              }

              return undefined
            },
            invalidateModule(module: EnvironmentModuleNode) {
              invalidatedModules.push(module)
            },
          },
        },
      },
      {
        modules: [changedModule],
      },
    )

    expect(result).toEqual([changedModule, providerModule])
    expect(invalidatedModules).toContain(changedModule)
    expect(invalidatedModules).toContain(providerModule)
    expect(invalidatedModules).toContain(lookupModule)
  })

  test('invalidates compiler virtual modules for changed source files', async () => {
    const plugins = startCompilerPlugin({
      framework: 'react',
      providerEnvName: 'client',
      environments: [{ name: 'client', type: 'client' }],
    }) as Array<Plugin>
    const plugin = plugins.find(
      (candidate) => candidate.name === 'tanstack-start-core::server-fn:client',
    )!

    const changedModule = {
      id: '/src/routes/index.tsx',
      importers: new Set<EnvironmentModuleNode>(),
    } as EnvironmentModuleNode
    const hydrateModule = {
      id: '/src/routes/index.tsx?tss-hydrate=0_boundary',
      importers: new Set<EnvironmentModuleNode>(),
    } as EnvironmentModuleNode
    const invalidatedModules: Array<EnvironmentModuleNode> = []

    const result = await (plugin.hotUpdate as any).call(
      {
        environment: {
          name: 'client',
          mode: 'dev',
          moduleGraph: {
            getModulesByFile(file: string) {
              if (file === '/src/routes/index.tsx') {
                return new Set([changedModule, hydrateModule])
              }

              return undefined
            },
            invalidateModule(module: EnvironmentModuleNode) {
              invalidatedModules.push(module)
            },
          },
        },
      },
      {
        modules: [changedModule],
      },
    )

    expect(result).toEqual([changedModule, hydrateModule])
    expect(invalidatedModules).toContain(hydrateModule)
  })
})

describe('startCompilerPlugin Vite virtual modules', () => {
  test('asks Vite to transform the parent module when a Hydrate child loads after invalidation', async () => {
    const root = '/repo'
    const sourceId = '/repo/src/routes/index.tsx'
    const sourceHash = crypto
      .createHash('sha1')
      .update('src/routes/index.tsx')
      .digest('hex')
      .slice(0, 10)
    const virtualId = `${sourceId}?tss-hydrate=0_${sourceHash}`
    const source = `
      import { Hydrate } from '@tanstack/react-start'
      import { visible } from '@tanstack/react-start/hydration'

      export function Page() {
        return <Hydrate when={visible()}><p>New</p></Hydrate>
      }
    `
    const plugins = startCompilerPlugin({
      framework: 'react',
      providerEnvName: 'client',
      environments: [{ name: 'client', type: 'client' }],
    }) as Array<Plugin>
    const transformPlugin = plugins.find(
      (candidate) => candidate.name === 'tanstack-start-core::server-fn:client',
    )!
    const virtualModulePlugin = plugins.find(
      (candidate) =>
        candidate.name === 'tanstack-start-core:compiler-virtual-module',
    )!

    const configResolved = transformPlugin.configResolved as any
    await (typeof configResolved === 'function'
      ? configResolved({ root })
      : configResolved.handler({ root }))

    const transformRequest = vi.fn(async (id: string) => {
      await (transformPlugin.transform as any).handler.call(
        {
          environment: {
            name: 'client',
            mode: 'dev',
          },
          resolve: vi.fn(),
        },
        source,
        id,
      )

      return { code: source }
    })

    const result = await (virtualModulePlugin.load as any).handler.call(
      {
        environment: {
          name: 'client',
          mode: 'dev',
          transformRequest,
        },
      },
      virtualId,
    )

    expect(transformRequest).toHaveBeenCalledWith(sourceId)
    expect(result.code).toContain('New')
  })
})
