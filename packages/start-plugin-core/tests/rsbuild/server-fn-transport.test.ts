import { describe, expect, test, vi } from 'vitest'
import { applyServerFnCodecSplitting } from '../../src/rsbuild/server-fn-transport'
import type { Rspack } from '@rsbuild/core'

function moduleAt(path: string | null) {
  return { nameForCondition: () => path } as Rspack.Module
}

function chunk(initial = false) {
  return { canBeInitial: () => initial } as Rspack.Chunk
}

function graph(chunks: Array<Rspack.Chunk>, members: Array<Rspack.Module>) {
  const getChunkModulesIterable = vi.fn(() => members)
  return {
    chunkGraph: {
      getModuleChunksIterable: () => chunks,
      getChunkModulesIterable,
    } as unknown as Rspack.Compilation['chunkGraph'],
    moduleGraph: {} as Rspack.Compilation['moduleGraph'],
    getChunkModulesIterable,
  }
}

function vendorTest() {
  const config: Rspack.Configuration = {
    optimization: { splitChunks: {} },
  }
  applyServerFnCodecSplitting(config)
  const splitChunks = config.optimization!.splitChunks!
  if (!splitChunks) {
    throw new Error('Expected chunk splitting')
  }
  const group = splitChunks.cacheGroups!.defaultVendors
  if (!group || typeof group.test !== 'function') {
    throw new Error('Expected vendor filter')
  }
  return group.test
}

const vendor = moduleAt('/app/node_modules/seroval/dist/index.js')
const codec = moduleAt(
  '/app/node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnCodec.js',
)

describe('codec vendor splitting', () => {
  test.each([
    '/repo/packages/start-client-core/src/client-rpc/serverFnCodec.ts',
    '/repo/packages/start-client-core/dist/esm/client-rpc/serverFnCodec.js',
    '/app/node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnCodec.js',
    '/app/node_modules/.pnpm/@tanstack+start-client-core@1.0.0/node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnCodec.js',
    'C:\\app\\node_modules\\@tanstack\\start-client-core\\dist\\esm\\client-rpc\\serverFnCodec.js',
  ])('keeps exclusive dependencies with codec at %s', (path) => {
    expect(
      vendorTest()(vendor, graph([chunk()], [moduleAt(path), vendor])),
    ).toBe(false)
  })

  test('recognizes a Windows vendor path', () => {
    expect(
      vendorTest()(
        moduleAt('C:\\app\\node_modules\\seroval\\dist\\index.js'),
        graph([chunk()], [codec]),
      ),
    ).toBe(false)
  })

  test.each([
    '/app/src/vendor.ts',
    '/app/not_node_modules/seroval/index.js',
    null,
  ])('does not treat %s as a vendor', (path) => {
    expect(vendorTest()(moduleAt(path), graph([chunk()], []))).toBe(false)
  })

  test('leaves unrelated async vendors eligible for extraction', () => {
    expect(vendorTest()(vendor, graph([chunk()], [vendor]))).toBe(true)
  })

  test('does not mistake the initial codec loader for the codec', () => {
    const loader = moduleAt(
      '/repo/packages/start-client-core/dist/esm/client-rpc/serverFnCodecLoader.lazy.js',
    )
    expect(vendorTest()(vendor, graph([chunk()], [loader]))).toBe(true)
  })

  test('preserves a vendor shared with another async chunk', () => {
    expect(
      vendorTest()(vendor, graph([chunk(), chunk()], [codec, vendor])),
    ).toBe(true)
  })

  test('preserves initial vendors and vendors shared with an initial chunk', () => {
    const filter = vendorTest()
    expect(filter(vendor, graph([chunk(true)], [codec, vendor]))).toBe(true)
    expect(filter(vendor, graph([chunk(), chunk(true)], [codec, vendor]))).toBe(
      true,
    )
  })

  test('leaves chunkless vendors alone', () => {
    expect(vendorTest()(vendor, graph([], []))).toBe(true)
  })

  test('scans each chunk once, scoped to its compilation graph', () => {
    const filter = vendorTest()
    const sharedChunk = chunk()
    const first = graph([sharedChunk], [codec, vendor])
    for (let i = 0; i < 100; i++) {
      expect(filter(vendor, first)).toBe(false)
    }
    expect(first.getChunkModulesIterable).toHaveBeenCalledOnce()

    const nextCompilation = graph([sharedChunk], [vendor])
    expect(filter(vendor, nextCompilation)).toBe(true)
    expect(nextCompilation.getChunkModulesIterable).toHaveBeenCalledOnce()
  })
})

describe('resolved split configuration', () => {
  test.each<Rspack.Configuration>([
    {},
    { optimization: {} },
    { optimization: { splitChunks: false } },
  ])('preserves absent or disabled splitting', (config) => {
    const before = structuredClone(config)
    applyServerFnCodecSplitting(config)
    expect(config).toEqual(before)
  })

  test.each([false as const, { test: /custom/ }, { test: () => true }])(
    'preserves explicit defaultVendors: %s',
    (defaultVendors) => {
      const splitChunks = { cacheGroups: { defaultVendors } }
      applyServerFnCodecSplitting({ optimization: { splitChunks } })
      expect(splitChunks.cacheGroups.defaultVendors).toBe(defaultVendors)
    },
  )

  test('preserves an explicitly undefined vendor group from JavaScript config', () => {
    const cacheGroups: NonNullable<
      Rspack.OptimizationSplitChunksOptions['cacheGroups']
    > = {}
    Object.defineProperty(cacheGroups, 'defaultVendors', {
      value: undefined,
      enumerable: true,
    })
    applyServerFnCodecSplitting({
      optimization: { splitChunks: { cacheGroups } },
    })
    expect(cacheGroups.defaultVendors).toBeUndefined()
  })

  test('preserves preset/custom groups and inherited chunk names', () => {
    const vendors = { test: /node_modules/, name: 'vendor', priority: 0 }
    const custom = { test: /editor/, name: 'editor' }
    const splitChunks: Rspack.OptimizationSplitChunksOptions = {
      name: 'custom-name',
      cacheGroups: { vendors, custom },
    }
    applyServerFnCodecSplitting({ optimization: { splitChunks } })
    expect(splitChunks.name).toBe('custom-name')
    expect(splitChunks.cacheGroups!.vendors).toBe(vendors)
    expect(splitChunks.cacheGroups!.custom).toBe(custom)
    expect(splitChunks.cacheGroups!.defaultVendors).toEqual({
      idHint: 'vendors',
      test: expect.any(Function),
      priority: -10,
      reuseExistingChunk: true,
    })
  })

  test('does not replace a previously installed group', () => {
    const splitChunks: Rspack.OptimizationSplitChunksOptions = {}
    const config = { optimization: { splitChunks } }
    applyServerFnCodecSplitting(config)
    const group = splitChunks.cacheGroups!.defaultVendors
    applyServerFnCodecSplitting(config)
    expect(splitChunks.cacheGroups!.defaultVendors).toBe(group)
  })
})
