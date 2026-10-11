import { describe, expect, test } from 'vitest'
import { RSBUILD_ENVIRONMENT_NAMES } from '../../src/rsbuild/planning'
import { tapServerFnResolverRebuild } from '../../src/rsbuild/server-fn-resolver-rebuild'
import { registerVirtualModules } from '../../src/rsbuild/virtual-modules'
import type { ServerFn } from '../../src/start-compiler/types'

type FinishMakeTap = (compilation: { compiler: object }) => Promise<void>

function serverFn(name: string): ServerFn {
  return {
    functionName: name,
    functionId: name,
    extractedFilename: `/app/src/${name}.ts?tss-serverfn-split`,
    filename: `/app/src/${name}.ts`,
  }
}

function setup(opts: { action?: 'dev' | 'build'; rsc?: boolean } = {}) {
  const serverFnsById: Record<string, ServerFn> = {}
  const virtualModules = registerVirtualModules(
    {
      context: { action: opts.action ?? 'dev' },
      modifyRspackConfig: () => {},
    } as any,
    {
      root: '/app',
      getConfig: () => {
        throw new Error('getConfig is not used by these tests')
      },
      serverFnsById,
      providerEnvName: RSBUILD_ENVIRONMENT_NAMES.server,
      ssrIsProvider: true,
      serializationAdapters: undefined,
      getDevClientEntryUrl: () => '/client.js',
      rscEnabled: opts.rsc,
      scriptFormat: 'module',
    },
  )

  const taps: Array<FinishMakeTap> = []
  const compiler = {
    hooks: {
      finishMake: {
        tapPromise: (_options: unknown, tap: FinishMakeTap) => {
          taps.push(tap)
        },
      },
    },
  }

  // Wired the same way as the non-RSC and RSC hooks in plugin.ts.
  let rebuilds = 0
  let duringNextRebuild: (() => void) | undefined
  tapServerFnResolverRebuild(compiler as any, {
    name: 'test',
    updateResolver: opts.rsc
      ? () => {
          virtualModules.tryUpdateServerFnResolver(
            virtualModules.generateCurrentResolverContent(true),
          )
        }
      : () => {
          virtualModules.updateServerFnResolver()
        },
    getResolverWriteCount: () =>
      virtualModules.getServerFnResolverWriteCount(
        RSBUILD_ENVIRONMENT_NAMES.server,
      ),
    rebuildResolver: () => {
      rebuilds++
      const during = duringNextRebuild
      duringNextRebuild = undefined
      during?.()
      return Promise.resolve()
    },
  })

  const runFinishMake = async (compilationCompiler: object) => {
    for (const tap of taps) {
      await tap({ compiler: compilationCompiler })
    }
  }

  return {
    serverFnsById,
    virtualModules,
    rebuilds: () => rebuilds,
    duringNextRebuild: (callback: () => void) => {
      duringNextRebuild = callback
    },
    finishMake: () => runFinishMake(compiler),
    // Rspack copies finishMake taps into child compilers.
    finishMakeInChild: () => runFinishMake({}),
  }
}

describe('server function resolver rebuild', () => {
  test.each([
    { resolver: 'resolver', rsc: false },
    { resolver: 'RSC resolver', rsc: true },
  ])(
    'rebuilds the $resolver only when its content changes',
    async ({ rsc }) => {
      const t = setup({ rsc })

      await t.finishMake()
      expect(t.rebuilds()).toBe(1)

      await t.finishMake()
      expect(t.rebuilds()).toBe(1)

      t.serverFnsById.a = serverFn('a')
      await t.finishMake()
      expect(t.rebuilds()).toBe(2)

      await t.finishMake()
      expect(t.rebuilds()).toBe(2)

      delete t.serverFnsById.a
      await t.finishMake()
      expect(t.rebuilds()).toBe(3)
    },
  )

  test('rebuilds after another write to the resolver, even if the content is restored', async () => {
    const t = setup()
    await t.finishMake()

    // For example, a child compilation that wrote content from another registry.
    t.virtualModules.tryUpdateServerFnResolver('export {}')
    await t.finishMake()
    expect(t.rebuilds()).toBe(2)
  })

  test('rebuilds after a write that lands while the resolver is being rebuilt', async () => {
    const t = setup()
    // For example, another compiler's finishMake updating the shared registry.
    t.duringNextRebuild(() => {
      t.serverFnsById.a = serverFn('a')
      t.virtualModules.updateServerFnResolver()
    })

    await t.finishMake()
    await t.finishMake()
    expect(t.rebuilds()).toBe(2)
  })

  test('child compilations always rebuild and do not count for the parent', async () => {
    const t = setup()

    await t.finishMakeInChild()
    await t.finishMake()
    expect(t.rebuilds()).toBe(2)

    await t.finishMakeInChild()
    expect(t.rebuilds()).toBe(3)

    await t.finishMake()
    expect(t.rebuilds()).toBe(3)
  })

  test('rebuilds in every compilation of a production build', async () => {
    const t = setup({ action: 'build' })

    await t.finishMake()
    await t.finishMake()
    expect(t.rebuilds()).toBe(2)
  })
})
