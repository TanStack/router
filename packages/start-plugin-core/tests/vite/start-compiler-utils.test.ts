import { describe, expect, test, vi } from 'vitest'
import {
  createViteDevServerFnModuleSpecifierEncoder,
  decodeViteDevServerModuleSpecifier,
} from '../../src/vite/start-compiler-plugin/module-specifier'
import { mergeHotUpdateModules } from '../../src/vite/start-compiler-plugin/hot-update'
import {
  loadViteModuleFromEnvironment,
  startCompilerPlugin,
} from '../../src/vite/start-compiler-plugin/plugin'
import type { EnvironmentModuleNode, Plugin } from 'vite'

test.each([
  { mode: 'build', isBundled: true },
  { mode: 'dev', isBundled: true },
  { mode: 'dev', isBundled: false },
])(
  'loads compiler dependencies through the correct lifecycle: %j',
  async ({ mode, isBundled }) => {
    const transformRequest = vi.fn(async () => null)
    const environment = {
      mode,
      config: { isBundled },
      transformRequest,
    }
    const load = vi.fn(async () => ({ code: 'export const value = 1' }))
    const result = await Reflect.apply(
      loadViteModuleFromEnvironment,
      undefined,
      [
        environment,
        '/app/module.ts',
        {
          devId: '/app/module.ts?tss-serverfn-lookup',
          load,
          error(message: string) {
            throw new Error(message)
          },
        },
      ],
    )

    if (isBundled) {
      expect(result).toBe('export const value = 1')
      expect(load).toHaveBeenCalledExactlyOnceWith({ id: '/app/module.ts' })
      expect(transformRequest).not.toHaveBeenCalled()
    } else {
      expect(result).toBeUndefined()
      expect(transformRequest).toHaveBeenCalledExactlyOnceWith(
        '/app/module.ts?tss-serverfn-lookup',
      )
      expect(load).not.toHaveBeenCalled()
    }
  },
)

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

test('bundled dev does not require a Vite context in the client hotUpdate hook', () => {
  const plugins = startCompilerPlugin({
    framework: 'react',
    environments: [{ name: 'client', type: 'client' }],
    providerEnvName: 'ssr',
  }) as Array<Plugin>
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start-core::server-fn:client',
  )!

  if (
    typeof plugin.configResolved !== 'function' ||
    typeof plugin.hotUpdate !== 'function'
  ) {
    throw new Error('Expected compiler configuration and hotUpdate hooks')
  }

  expect(plugin.perEnvironmentWatchChangeDuringDev).toBe(false)
  Reflect.apply(plugin.configResolved, undefined, [
    { root: '/app', experimental: { bundledDev: true } },
  ])
  expect(plugin.perEnvironmentWatchChangeDuringDev).toBe(true)

  expect(
    Reflect.apply(plugin.hotUpdate, undefined, [
      { type: 'update', file: '/app/src/route.tsx', modules: [] },
    ]),
  ).toBeUndefined()

  Reflect.apply(plugin.configResolved, undefined, [
    { root: '/app', experimental: { bundledDev: false } },
  ])
  expect(plugin.perEnvironmentWatchChangeDuringDev).toBe(false)
})
