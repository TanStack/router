import { describe, expect, it, vi } from 'vitest'
import { getRouteOptionDeleteNodes } from '../src/start-router-plugin/route-option-delete-nodes'
import { VITE_ENVIRONMENT_NAMES } from '../src/constants'
import { RSBUILD_ENVIRONMENT_NAMES } from '../src/rsbuild/planning'
import type { GetConfigFn } from '../src/types'

vi.mock('@tanstack/router-plugin/vite', () => ({
  tanstackRouterGenerator: vi.fn(() => ({ name: 'generator' })),
  tanStackRouterCodeSplitter: vi.fn((getOptions: () => unknown) => ({
    name: 'code-splitter',
    getOptions,
  })),
}))

vi.mock('@tanstack/router-plugin/rspack', () => ({
  TanStackRouterGeneratorRspack: vi.fn(() => ({ name: 'generator' })),
  TanStackRouterCodeSplitterRspack: vi.fn((options: unknown) => ({
    name: 'code-splitter',
    options,
  })),
}))

const CLIENT_NODES = [
  'ssr',
  'server',
  'headers',
  'context.dehydrate',
  'beforeLoad.dehydrate',
  'loader.dehydrate',
]

const SERVER_NODES = [
  'context.hydrate',
  'beforeLoad.hydrate',
  'loader.hydrate',
  'context.revalidate',
]

/** A user list with one entry each build already deletes. */
const USER_NODES = ['headers', 'loader.staleReloadMode', 'context.hydrate']

const MERGED_CLIENT_NODES = [
  'headers',
  'loader.staleReloadMode',
  'context.hydrate',
  'ssr',
  'server',
  'context.dehydrate',
  'beforeLoad.dehydrate',
  'loader.dehydrate',
]

const MERGED_SERVER_NODES = [
  'headers',
  'loader.staleReloadMode',
  'context.hydrate',
  'beforeLoad.hydrate',
  'loader.hydrate',
  'context.revalidate',
]

describe('getRouteOptionDeleteNodes', () => {
  it('deletes the server-only options and every dehydrate from the client build', () => {
    expect(getRouteOptionDeleteNodes('client', undefined)).toEqual(CLIENT_NODES)
    expect(getRouteOptionDeleteNodes('client', [])).toEqual(CLIENT_NODES)
  })

  it('deletes every hydrate and context.revalidate from the server build', () => {
    expect(getRouteOptionDeleteNodes('server', undefined)).toEqual(SERVER_NODES)
    expect(getRouteOptionDeleteNodes('server', [])).toEqual(SERVER_NODES)
  })

  it('merges user nodes in front of the built-in ones, without duplicates', () => {
    const user = [...USER_NODES]

    expect(getRouteOptionDeleteNodes('client', user)).toEqual(
      MERGED_CLIENT_NODES,
    )
    expect(getRouteOptionDeleteNodes('server', user)).toEqual(
      MERGED_SERVER_NODES,
    )
    expect(user).toEqual(USER_NODES)
  })
})

const getConfig = (() => ({
  startConfig: {
    router: {
      generatedRouteTree: '/app/src/routeTree.gen.ts',
      codeSplittingOptions: { deleteNodes: USER_NODES },
    },
  },
})) as unknown as GetConfigFn

describe('the Start router plugins pass the merged lists to the code splitter', () => {
  it('vite: one code splitter per environment', async () => {
    const { tanStackStartRouter } =
      await import('../src/vite/start-router-plugin/plugin')

    const plugins = tanStackStartRouter({} as never, getConfig, {
      framework: 'react',
    } as never) as Array<{ name?: string; getOptions?: () => any }>

    const byEnvironment = Object.fromEntries(
      plugins
        .filter((plugin) => plugin.name === 'code-splitter')
        .map((plugin) => plugin.getOptions!())
        .map((options) => [
          options.plugin.vite.environmentName,
          options.codeSplittingOptions,
        ]),
    )

    expect(Object.keys(byEnvironment)).toEqual([
      VITE_ENVIRONMENT_NAMES.client,
      VITE_ENVIRONMENT_NAMES.server,
    ])
    expect(byEnvironment[VITE_ENVIRONMENT_NAMES.client]).toEqual({
      deleteNodes: MERGED_CLIENT_NODES,
      addHmr: true,
    })
    expect(byEnvironment[VITE_ENVIRONMENT_NAMES.server]).toEqual({
      deleteNodes: MERGED_SERVER_NODES,
      addHmr: false,
    })
  })

  it('rsbuild: one code splitter per environment', async () => {
    const { registerRouterPlugins } =
      await import('../src/rsbuild/start-router-plugin')
    const { TanStackRouterCodeSplitterRspack } =
      await import('@tanstack/router-plugin/rspack')
    const codeSplitter = vi.mocked(TanStackRouterCodeSplitterRspack)
    codeSplitter.mockClear()

    let modifyRspackConfig:
      | ((config: unknown, utils: unknown) => void)
      | undefined
    registerRouterPlugins(
      {
        modifyRspackConfig: (callback: typeof modifyRspackConfig) => {
          modifyRspackConfig = callback
        },
      } as never,
      {
        getConfig,
        corePluginOpts: { framework: 'react' } as never,
        startPluginOpts: {} as never,
      },
    )

    for (const name of [
      RSBUILD_ENVIRONMENT_NAMES.client,
      RSBUILD_ENVIRONMENT_NAMES.server,
    ]) {
      modifyRspackConfig!({}, { environment: { name }, appendPlugins: vi.fn() })
    }

    const options = codeSplitter.mock.calls.map(([config]) => {
      // the factory also accepts a config function; Start passes an object
      if (typeof config !== 'object') {
        throw new Error(
          'expected the code splitter to receive an options object',
        )
      }
      return config.codeSplittingOptions
    })
    expect(options).toEqual([
      { deleteNodes: MERGED_CLIENT_NODES, addHmr: true },
      { deleteNodes: MERGED_SERVER_NODES, addHmr: false },
    ])
  })
})
