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
    const { build, actualOrder, expectedOrder } = await compileClientFixture(
      { mode },
      (compilation) => {
        const expectedOrder = expectedChunkFileOrder(compilation)
        const clientBuild = normalizeRspackClientBuild(compilation)
        return {
          build: serializeClientBuild(clientBuild),
          actualOrder: Array.from(clientBuild.chunksByFileName.keys()),
          expectedOrder,
        }
      },
    )
    expect(actualOrder).toEqual(expectedOrder)
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
    const facts = await compileClientFixture({ mode }, (compilation) => {
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

      return {
        taggedChunkCount: taggedChunks.size,
        totalChunkCount: compilation.chunks.size,
        listedChunkCount: new Set(calls.chunks).size,
        recordedCalls: calls.chunks.map((chunk) => ({
          name: chunk.name,
          isTagged: taggedChunks.has(chunk),
        })),
      }
    })
    expect(facts.taggedChunkCount).toBeGreaterThan(0)
    expect(facts.taggedChunkCount).toBeLessThan(facts.totalChunkCount)
    expect(facts.listedChunkCount).toBe(facts.taggedChunkCount)
    expect(facts.recordedCalls).toHaveLength(facts.taggedChunkCount)
    for (const call of facts.recordedCalls) {
      expect(call.isTagged, `getChunkModules(${call.name})`).toBe(true)
    }
  })

  test('fixture exercises the shapes the normalizer must preserve', async () => {
    const facts = await compileClientFixture({ mode }, (compilation) => {
      const chunks = Array.from(compilation.chunks)
      const groups = Array.from(compilation.chunkGroups)
      const tooltipChunks = new Set(
        chunks.filter((chunk) =>
          compilation.chunkGraph
            .getChunkModules(chunk)
            .some((module) =>
              module
                .identifier()
                .replace(/\\/g, '/')
                .includes('/islands/tooltip.js?tss-hydrate=tooltip'),
            ),
        ),
      )

      return {
        hasSiblingJsChunks: groups.some(
          (group) => group.chunks.filter(hasJsFile).length >= 2,
        ),
        hasSharedChunk: chunks.some(
          (chunk) => Array.from(chunk.groupsIterable).length >= 2,
        ),
        hasCssOnlyChunk: chunks.some((chunk) => !hasJsFile(chunk)),
        hasAuxiliaryCss: chunks.some((chunk) =>
          Array.from(chunk.auxiliaryFiles).some((file) =>
            file.endsWith('.css'),
          ),
        ),
        hasTwoPostsSplits: chunks.some(
          (chunk) =>
            compilation.chunkGraph.getChunkModules(chunk).filter((module) => {
              const identifier = module.identifier().replace(/\\/g, '/')
              return identifier.includes('/routes/posts.js?tsr-split=')
            }).length === 2,
        ),
        hasTooltipThroughVendors: groups.some(
          (group) =>
            group.chunks.some((chunk) => chunk.name === 'vendors') &&
            Array.from(group.childrenIterable).some((child) =>
              child.chunks.some((chunk) => tooltipChunks.has(chunk)),
            ),
        ),
        hasPostsConcatenationRoot:
          mode === 'production' &&
          Array.from(compilation.modules).some(
            (module) =>
              module.constructor.name === 'ConcatenatedModule' &&
              module.identifier().includes('posts.js?tsr-split='),
          ),
      }
    })
    expect(facts.hasSiblingJsChunks, 'a group has sibling JS chunks').toBe(true)
    expect(
      facts.hasSharedChunk,
      'a shared chunk belongs to multiple groups',
    ).toBe(true)
    expect(facts.hasCssOnlyChunk, 'a CSS-only chunk is present').toBe(true)
    expect(facts.hasAuxiliaryCss, 'CSS assets appear in auxiliaryFiles').toBe(
      true,
    )
    expect(
      facts.hasTwoPostsSplits,
      'two posts split modules share a chunk',
    ).toBe(true)
    expect(
      facts.hasTooltipThroughVendors,
      'tooltip is reachable through a vendors group',
    ).toBe(true)
    if (mode === 'production') {
      expect(
        facts.hasPostsConcatenationRoot,
        'a posts split is a concatenation root',
      ).toBe(true)
    }
  })
})

test('merges rsc CSS into the main entry without making rsc the entry', async () => {
  const { indexChunk, rscChunk, actualOrder, expectedOrder } =
    await compileClientFixture(
      { mode: 'production', withRscEntry: true },
      (compilation) => {
        const expectedOrder = expectedChunkFileOrder(compilation)
        const clientBuild = normalizeRspackClientBuild(compilation)
        return {
          indexChunk: clientBuild.chunksByFileName.get('index.js'),
          rscChunk: clientBuild.chunksByFileName.get('rsc.js'),
          actualOrder: Array.from(clientBuild.chunksByFileName.keys()),
          expectedOrder,
        }
      },
    )
  expect(actualOrder).toEqual(expectedOrder)
  expect(indexChunk?.css.at(-1)).toBe('rsc.css')
  expect(
    indexChunk?.css.filter((fileName) => fileName === 'rsc.css'),
  ).toHaveLength(1)
  expect(rscChunk).toBeDefined()
  expect(rscChunk?.isEntry).toBe(false)
})

describe.each<{ mode: FixtureMode; withRscEntry: boolean }>([
  { mode: 'development', withRscEntry: false },
  { mode: 'production', withRscEntry: false },
  { mode: 'production', withRscEntry: true },
])('$mode, rsc=$withRscEntry', (options) => {
  test('reads each chunk and chunk group graph property at most once', async () => {
    const maxReadsByProperty = await compileClientFixture(
      options,
      (compilation) => {
        let chunkReads: ReturnType<typeof countPropertyReads> | undefined
        let groupReads: ReturnType<typeof countPropertyReads> | undefined
        try {
          chunkReads = countPropertyReads(
            compilation.chunks.values().next().value!,
            ['files', 'auxiliaryFiles', 'groupsIterable'],
          )
          groupReads = countPropertyReads(
            compilation.entrypoints.get('index')!,
            ['chunks', 'childrenIterable'],
          )
          normalizeRspackClientBuild(compilation)
        } finally {
          groupReads?.restore()
          chunkReads?.restore()
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
        return Array.from(maxReadsByProperty)
      },
    )
    expect(maxReadsByProperty).toHaveLength(5)
    for (const [property, maxCount] of maxReadsByProperty) {
      expect(
        maxCount,
        `${property}: max reads per receiver = ${maxCount}`,
      ).toBeLessThanOrEqual(1)
    }
  })
})

test('matches the recorded client build with inline CSS', async () => {
  const {
    cssContentByFileName,
    actualOrder,
    expectedOrder,
    actualCssOrder,
    expectedCssOrder,
  } = await compileClientFixture({ mode: 'production' }, (compilation) => {
    const expectedOrder = expectedChunkFileOrder(compilation)
    const expectedCssOrder = cssAssetOrder(compilation)
    const build = normalizeRspackClientBuild(compilation, true)
    return {
      cssContentByFileName: serializeClientBuild(build).cssContentByFileName,
      actualOrder: Array.from(build.chunksByFileName.keys()),
      expectedOrder,
      actualCssOrder: Array.from(build.cssContentByFileName!.keys()),
      expectedCssOrder,
    }
  })
  expect(actualOrder).toEqual(expectedOrder)
  expect(actualCssOrder).toEqual(expectedCssOrder)
  expect(cssContentByFileName).toMatchSnapshot()
})
