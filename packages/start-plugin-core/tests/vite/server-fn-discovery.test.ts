import { describe, expect, test, vi } from 'vitest'
import { discoverProviderServerFns } from '../../src/vite/start-compiler-plugin/server-fn-discovery'
import type { ServerFn } from '../../src/start-compiler/types'

const SPLIT = '?tss-serverfn-split'

function serverFn(filename: string, functionName: string): ServerFn {
  return {
    functionName: `${functionName}_createServerFn_handler`,
    functionId: `${functionName}-id`,
    filename,
    extractedFilename: `${filename}${SPLIT}`,
    isClientReferenced: true,
  }
}

function createGraph(
  modules: Record<
    string,
    { imports?: Array<string>; dynamicImports?: Array<string> }
  >,
  discoveries: Record<string, Array<ServerFn>> = {},
  externals: Array<string> = [],
) {
  const serverFns: Record<string, ServerFn> = {}
  const loaded: Array<string> = []
  const load = vi.fn(async ({ id }: { id: string }) => {
    loaded.push(id)
    for (const fn of discoveries[id] ?? []) {
      serverFns[fn.functionId] = fn
    }
    const module = modules[id]
    if (!module) {
      return null
    }
    return {
      importedIds: module.imports ?? [],
      dynamicallyImportedIds: module.dynamicImports ?? [],
    }
  })
  const resolve = vi.fn(async (id: string) => ({
    external: externals.includes(id),
  }))
  return {
    load,
    loaded,
    serverFns,
    run: () =>
      discoverProviderServerFns({
        load,
        resolve,
        getServerFns: () => serverFns,
      }),
  }
}

describe('discoverProviderServerFns', () => {
  test('registers a server function only reachable through a provider module', async () => {
    const graph = createGraph(
      {
        [`/app/outer.ts${SPLIT}`]: { imports: ['/app/inner.ts'] },
      },
      {
        '/app/inner.ts': [serverFn('/app/inner.ts', 'inner')],
      },
    )
    graph.serverFns['outer-id'] = serverFn('/app/outer.ts', 'outer')

    await graph.run()

    expect(Object.keys(graph.serverFns).sort()).toEqual([
      'inner-id',
      'outer-id',
    ])
    expect(graph.loaded).toContain(`/app/inner.ts${SPLIT}`)
  })

  test('follows the provider graph until no new server function appears', async () => {
    const graph = createGraph(
      {
        [`/app/outer.ts${SPLIT}`]: { imports: ['/app/helpers.ts'] },
        '/app/helpers.ts': { dynamicImports: ['/app/deepest.ts'] },
      },
      {
        '/app/deepest.ts': [serverFn('/app/deepest.ts', 'deepest')],
      },
    )
    graph.serverFns['outer-id'] = serverFn('/app/outer.ts', 'outer')

    await graph.run()

    expect(Object.keys(graph.serverFns).sort()).toEqual([
      'deepest-id',
      'outer-id',
    ])
  })

  test('loads every module once', async () => {
    const graph = createGraph({
      [`/app/a.ts${SPLIT}`]: { imports: ['/app/shared.ts'] },
      [`/app/b.ts${SPLIT}`]: { imports: ['/app/shared.ts'] },
      '/app/shared.ts': { imports: [`/app/a.ts${SPLIT}`] },
    })
    graph.serverFns['a-id'] = serverFn('/app/a.ts', 'a')
    graph.serverFns['b-id'] = serverFn('/app/b.ts', 'b')

    await graph.run()

    expect(graph.loaded).toHaveLength(new Set(graph.loaded).size)
    expect(graph.loaded.sort()).toEqual([
      `/app/a.ts${SPLIT}`,
      `/app/b.ts${SPLIT}`,
      '/app/shared.ts',
    ])
  })

  test('skips virtual modules, externals and non-module imports', async () => {
    const graph = createGraph(
      {
        [`/app/outer.ts${SPLIT}`]: {
          imports: [
            '\0virtual:tanstack-start',
            'external-dep/index.js',
            '/app/styles.css',
            '/app/data.json',
            '/app/used.ts',
          ],
        },
      },
      {},
      ['external-dep/index.js'],
    )
    graph.serverFns['outer-id'] = serverFn('/app/outer.ts', 'outer')

    await graph.run()

    expect(graph.loaded.sort()).toEqual([
      `/app/outer.ts${SPLIT}`,
      '/app/used.ts',
    ])
  })

  test('follows dependencies that are bundled', async () => {
    const graph = createGraph(
      {
        [`/app/outer.ts${SPLIT}`]: {
          imports: ['/app/node_modules/dep/index.js'],
        },
      },
      {
        '/app/node_modules/dep/index.js': [
          serverFn('/app/node_modules/dep/index.js', 'dep'),
        ],
      },
    )
    graph.serverFns['outer-id'] = serverFn('/app/outer.ts', 'outer')

    await graph.run()

    expect(Object.keys(graph.serverFns).sort()).toEqual(['dep-id', 'outer-id'])
  })

  test('keeps going when a module cannot be loaded', async () => {
    const serverFns: Record<string, ServerFn> = {
      'broken-id': serverFn('/app/broken.ts', 'broken'),
      'outer-id': serverFn('/app/outer.ts', 'outer'),
    }
    const load = vi.fn(async ({ id }: { id: string }) => {
      if (id === `/app/broken.ts${SPLIT}`) {
        throw new Error('load failed')
      }
      if (id === `/app/outer.ts${SPLIT}`) {
        serverFns['inner-id'] = serverFn('/app/inner.ts', 'inner')
        return { importedIds: [], dynamicallyImportedIds: [] }
      }
      return null
    })

    await expect(
      discoverProviderServerFns({
        load,
        resolve: async () => ({ external: false }),
        getServerFns: () => serverFns,
      }),
    ).resolves.toBeUndefined()

    expect(Object.keys(serverFns)).toContain('inner-id')
  })
})
