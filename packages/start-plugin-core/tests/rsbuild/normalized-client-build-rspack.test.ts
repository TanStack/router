import { describe, expect, test } from 'vitest'
import { normalizeRspackClientBuild } from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import {
  FIXTURE_ROOT,
  compileClientFixture,
  countPropertyReads,
  cssAssetOrder,
  expectedChunkFileOrder,
  fixtureRouteTreeRoutes,
  recordChunkModuleCalls,
  serializeClientBuild,
} from './rspack-client-build-fixture'
import type { Rspack } from '@rsbuild/core'
import type { FixtureMode } from './rspack-client-build-fixture'

function hasJsFile(chunk: Rspack.Chunk): boolean {
  return Array.from(chunk.files).some(
    (file) => file.endsWith('.js') || file.endsWith('.mjs'),
  )
}

describe.each<FixtureMode>(['development', 'production'])('%s', (mode) => {
  test('matches the recorded normalized client build', async () => {
    const build = await compileClientFixture({ mode }, (compilation) => {
      const expectedOrder = expectedChunkFileOrder(compilation)
      const clientBuild = normalizeRspackClientBuild(compilation)
      expect(Array.from(clientBuild.chunksByFileName.keys())).toEqual(
        expectedOrder,
      )
      return serializeClientBuild(clientBuild)
    })
    expect(build).toMatchSnapshot()
  })

  test('matches the recorded start manifest', async () => {
    const manifest = await compileClientFixture({ mode }, (compilation) =>
      buildStartManifest({
        clientBuild: normalizeRspackClientBuild(compilation),
        routeTreeRoutes: fixtureRouteTreeRoutes(),
        basePath: '/assets',
      }),
    )
    const serialized = JSON.stringify(manifest).replaceAll(
      FIXTURE_ROOT.replace(/\\/g, '/'),
      '<fixture>',
    )
    expect(JSON.parse(serialized)).toMatchSnapshot()
  })

  test('lists chunk modules only for chunks that hold a route split or hydration module', async () => {
    await compileClientFixture({ mode }, (compilation) => {
      const taggedChunks = new Set(
        Array.from(compilation.chunks).filter((chunk) =>
          compilation.chunkGraph.getChunkModules(chunk).some((module) => {
            const identifier = module.identifier()
            return (
              identifier.includes('tsr-split') ||
              identifier.includes('tss-hydrate')
            )
          }),
        ),
      )
      let calls: ReturnType<typeof recordChunkModuleCalls> | undefined
      try {
        calls = recordChunkModuleCalls(compilation.chunkGraph)
        normalizeRspackClientBuild(compilation)
      } finally {
        calls?.restore()
      }

      const listedChunks = new Set(calls.chunks)
      expect(listedChunks).toEqual(taggedChunks)
      expect(listedChunks.size).toBe(taggedChunks.size)
      expect(calls.chunks).toHaveLength(taggedChunks.size)
      for (const chunk of calls.chunks) {
        expect(taggedChunks.has(chunk)).toBe(true)
      }
    })
  })

  test('fixture exercises the shapes the normalizer must preserve', async () => {
    await compileClientFixture({ mode }, (compilation) => {
      const chunks = Array.from(compilation.chunks)
      const groups = Array.from(compilation.chunkGroups)

      expect(
        groups.some((group) => group.chunks.filter(hasJsFile).length >= 2),
        'a group has sibling JS chunks',
      ).toBe(true)
      expect(
        chunks.some((chunk) => Array.from(chunk.groupsIterable).length >= 2),
        'a shared chunk belongs to multiple groups',
      ).toBe(true)
      expect(
        chunks.some((chunk) => !hasJsFile(chunk)),
        'a CSS-only chunk is present',
      ).toBe(true)
      expect(
        chunks.some((chunk) =>
          Array.from(chunk.auxiliaryFiles).some((file) =>
            file.endsWith('.css'),
          ),
        ),
        'CSS assets appear in auxiliaryFiles',
      ).toBe(true)
      expect(
        chunks.some(
          (chunk) =>
            compilation.chunkGraph.getChunkModules(chunk).filter((module) => {
              const identifier = module.identifier().replace(/\\/g, '/')
              return identifier.includes('/routes/posts.js?tsr-split=')
            }).length === 2,
        ),
        'two posts split modules share a chunk',
      ).toBe(true)

      const hydrationChunks = new Set(
        chunks.filter((chunk) =>
          compilation.chunkGraph
            .getChunkModules(chunk)
            .some((module) => module.identifier().includes('?tss-hydrate=')),
        ),
      )
      expect(
        groups.some(
          (group) =>
            group.chunks.some((chunk) => chunk.name === 'vendors') &&
            Array.from(group.childrenIterable).some((child) =>
              child.chunks.some((chunk) => hydrationChunks.has(chunk)),
            ),
        ),
        'hydration is reachable through a vendors group',
      ).toBe(true)

      if (mode === 'production') {
        expect(
          Array.from(compilation.modules).some(
            (module) =>
              module.constructor.name === 'ConcatenatedModule' &&
              module.identifier().includes('posts.js?tsr-split='),
          ),
          'a posts split is a concatenation root',
        ).toBe(true)
      }
    })
  })
})

test('matches the recorded client build with an rsc entry', async () => {
  const build = await compileClientFixture(
    { mode: 'production', withRscEntry: true },
    (compilation) => {
      const expectedOrder = expectedChunkFileOrder(compilation)
      const clientBuild = normalizeRspackClientBuild(compilation)
      expect(Array.from(clientBuild.chunksByFileName.keys())).toEqual(
        expectedOrder,
      )
      return serializeClientBuild(clientBuild)
    },
  )
  expect(build).toMatchSnapshot()
})

describe.each<{ mode: FixtureMode; withRscEntry: boolean }>([
  { mode: 'development', withRscEntry: false },
  { mode: 'production', withRscEntry: false },
  { mode: 'production', withRscEntry: true },
])('$mode, rsc=$withRscEntry', (options) => {
  test('reads each chunk and chunk group graph property at most once', async () => {
    await compileClientFixture(options, (compilation) => {
      const chunkReads = countPropertyReads(
        compilation.chunks.values().next().value!,
        ['files', 'auxiliaryFiles', 'groupsIterable'],
      )
      const groupReads = countPropertyReads(
        compilation.entrypoints.get('index')!,
        ['chunks', 'childrenIterable'],
      )
      try {
        normalizeRspackClientBuild(compilation)
      } finally {
        groupReads.restore()
        chunkReads.restore()
      }

      const maxReadsByProperty = new Map<string, number>()
      for (const counter of [chunkReads, groupReads]) {
        for (const reads of counter.readsByReceiver.values()) {
          for (const [property, count] of reads) {
            maxReadsByProperty.set(
              property,
              Math.max(maxReadsByProperty.get(property) ?? 0, count),
            )
          }
        }
      }
      expect(maxReadsByProperty.size).toBe(5)
      for (const [property, maxCount] of maxReadsByProperty) {
        expect(
          maxCount,
          `${property}: max reads per receiver = ${maxCount}`,
        ).toBeLessThanOrEqual(1)
      }
    })
  })
})

test('matches the recorded client build with inline CSS', async () => {
  const build = await compileClientFixture(
    { mode: 'production' },
    (compilation) => {
      const expectedOrder = expectedChunkFileOrder(compilation)
      const expectedCssOrder = cssAssetOrder(compilation)
      const clientBuild = normalizeRspackClientBuild(compilation, true)
      expect(Array.from(clientBuild.chunksByFileName.keys())).toEqual(
        expectedOrder,
      )
      expect(Array.from(clientBuild.cssContentByFileName!.keys())).toEqual(
        expectedCssOrder,
      )
      return serializeClientBuild(clientBuild)
    },
  )
  expect(build).toMatchSnapshot()
})
