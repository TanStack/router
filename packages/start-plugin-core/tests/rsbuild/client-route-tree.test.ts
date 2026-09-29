import { describe, expect, test, vi } from 'vitest'
import { registerRouterPlugins } from '../../src/rsbuild/start-router-plugin'
import type { ModifyRspackConfigFn, RsbuildPluginAPI } from '@rsbuild/core'
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'
import type { GetConfigFn } from '../../src/types'

const { generatorPlugin } = vi.hoisted(() => ({ generatorPlugin: vi.fn() }))
vi.mock('@tanstack/router-plugin/rspack', () => ({
  TanStackRouterGeneratorRspack: generatorPlugin,
  TanStackRouterCodeSplitterRspack: vi.fn(),
}))

describe('Rsbuild client route tree', () => {
  test('removes a server-only route and keeps normal routes', async () => {
    let transform: Parameters<RsbuildPluginAPI['transform']>[1] | undefined
    let match: Parameters<RsbuildPluginAPI['transform']>[0] | undefined
    let generatorOptions: { plugins: Array<GeneratorPlugin> } | undefined
    generatorPlugin.mockImplementation(
      (options: { plugins: Array<GeneratorPlugin> }) => {
        generatorOptions = options
        return { name: 'generator' }
      },
    )
    const api = {
      context: { action: 'build' },
      modifyRspackConfig(callback: ModifyRspackConfigFn) {
        callback(
          {} as Parameters<ModifyRspackConfigFn>[0],
          {
            environment: { name: 'client' },
            appendPlugins: vi.fn(),
          } as unknown as Parameters<ModifyRspackConfigFn>[1],
        )
      },
      transform(options: typeof match, callback: typeof transform) {
        match = options
        transform = callback
      },
    } as unknown as RsbuildPluginAPI
    const getConfig = (() => ({
      startConfig: { router: { generatedRouteTree: 'src/routeTree.gen.ts' } },
      resolvedStartConfig: { root: '/app' },
    })) as GetConfigFn
    registerRouterPlugins(api, {
      getConfig,
      corePluginOpts: { framework: 'react' } as Parameters<
        typeof registerRouterPlugins
      >[1]['corePluginOpts'],
      startPluginOpts: {} as Parameters<
        typeof registerRouterPlugins
      >[1]['startPluginOpts'],
    })
    const serverOnly = {
      routePath: '/api/hook',
      variableName: 'ApiHook',
      createFileRouteProps: new Set(['server']),
    } as RouteNode
    const normal = {
      routePath: '/about',
      variableName: 'About',
      createFileRouteProps: new Set(['component']),
    } as RouteNode
    const nestedServerOnly = {
      routePath: '/api/internal',
      variableName: 'ApiInternal',
      createFileRouteProps: new Set(['server']),
    } as RouteNode
    const serverWithClientChild = {
      routePath: '/mixed',
      variableName: 'Mixed',
      createFileRouteProps: new Set(['server']),
      children: [normal],
    } as RouteNode
    const crawlingResult = {
      rootRouteNode: { routePath: '__root', variableName: 'Root' },
      acc: {
        routeTree: [
          { ...serverOnly, children: [nestedServerOnly] },
          serverWithClientChild,
        ],
        routeNodes: [
          serverOnly,
          nestedServerOnly,
          serverWithClientChild,
          normal,
        ],
      },
      routeFileResult: [],
    }
    const generator = {
      getCrawlingResult: vi.fn().mockResolvedValue(crawlingResult),
      buildRouteTree: vi
        .fn()
        .mockReturnValue({ routeTreeContent: '// client tree' }),
    } as unknown as Generator
    const initPlugin = generatorOptions?.plugins.find((plugin) => plugin.init)
    if (!initPlugin?.init) throw new Error('Expected generator init plugin')
    initPlugin.init({ generator } as Parameters<
      NonNullable<GeneratorPlugin['init']>
    >[0])

    expect(match?.environments).toEqual(['client'])
    expect(
      typeof match?.test === 'function' &&
        match.test('/app/src/routeTree.gen.ts'),
    ).toBe(true)
    expect(transform).toBeDefined()
    const result = await transform!({
      resourcePath: '/app/src/routeTree.gen.ts',
      code: 'original tree',
    } as Parameters<NonNullable<typeof transform>>[0])
    expect(result).toEqual({ code: '// client tree', map: null })
    expect(generator.buildRouteTree).toHaveBeenCalledOnce()
    const builtTree = vi.mocked(generator.buildRouteTree).mock.calls[0]?.[0]
    expect(builtTree?.acc.routeNodes.map((node) => node.routePath)).toEqual([
      '/about',
      '/mixed',
    ])
    expect(builtTree?.acc.routeTree.map((node) => node.routePath)).toEqual([
      '/mixed',
    ])
  })
})
