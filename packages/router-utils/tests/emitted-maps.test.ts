import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emittedMapTexts } from '../src/compiler'
import { fillSourcesContent } from '../src/compiler/hosts/emitted-maps'
import type { EmittedMapsCompilerLike } from '../src/compiler'

const context = path.resolve('/app')
const mapDir = path.join(context, 'dist/static/js')
const route = path.join(context, 'src/routes/index.tsx')
const texts = new Map([[route, 'export const Route = 1\n']])
const textOf = (file: string) => texts.get(file)

describe('fillSourcesContent', () => {
  it('fills a source each devtool naming spells, query and hash left out', () => {
    for (const source of [
      route,
      `${route}?tsr-split=component`,
      'webpack://app/./src/routes/index.tsx',
      'webpack:///./src/routes/index.tsx?abc#x',
      '../../../src/routes/index.tsx',
      pathToFileURL(route).href,
    ]) {
      const map = { sources: [source] }
      expect(fillSourcesContent(map, textOf, context, mapDir), source).toEqual([
        route,
      ])
      expect(map, source).toEqual({
        sources: [source],
        sourcesContent: ['export const Route = 1\n'],
      })
    }
  })

  it('keeps every text a source has, and fills only the files it is given', () => {
    const map = {
      sources: ['webpack://app/./src/a.ts', route, route, 'webpack://app/x'],
      sourcesContent: ['a', '', null, null],
    }
    expect(fillSourcesContent(map, textOf, context, mapDir)).toEqual([
      route,
      route,
    ])
    expect(map.sourcesContent).toEqual([
      'a',
      'export const Route = 1\n',
      'export const Route = 1\n',
      null,
    ])
  })

  it('leaves a map with nothing to fill, or a source root, as it is', () => {
    const none = { sources: ['webpack://app/./src/a.ts', null] }
    expect(fillSourcesContent(none, textOf, context, mapDir)).toEqual([])
    expect(none).toEqual({ sources: ['webpack://app/./src/a.ts', null] })
    const rooted = { sources: ['src/routes/index.tsx'], sourceRoot: '/app/' }
    expect(fillSourcesContent(rooted, textOf, context, mapDir)).toEqual([])
    expect(rooted).toEqual({
      sources: ['src/routes/index.tsx'],
      sourceRoot: '/app/',
    })
  })
})

describe('emittedMapTexts', () => {
  /** A compiler whose compilations emit the given chunks' maps, unfilled, as the devtool does every compilation. */
  function compiler() {
    let onCompilation: (compilation: any) => void = () => {}
    const fake = {
      context,
      options: { devtool: 'cheap-module-source-map' },
      webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_DEV_TOOLING: 500 },
        sources: {
          RawSource: class {
            constructor(readonly buffer: Buffer) {}
          },
        },
      },
      hooks: {
        thisCompilation: { tap: (_: string, fn: any) => (onCompilation = fn) },
        watchRun: { tap: () => {} },
      },
    }
    const record = emittedMapTexts(
      fake as unknown as EmittedMapsCompilerLike,
      'dev',
      () => true,
    )!
    /** One compilation: its chunks by hash and map JSON; returns the emitted maps. */
    const compile = (chunks: Array<{ hash: string; map: object }>) => {
      let onAssets: (assets: Record<string, any>) => void = () => {}
      const emitted: Record<string, unknown> = {}
      const assets = Object.fromEntries(
        chunks.map((c, i) => {
          const raw = JSON.stringify(c.map)
          emitted[`${i}.js.map`] = JSON.parse(raw)
          return [`${i}.js.map`, { source: () => raw }]
        }),
      )
      onCompilation({
        outputOptions: { path: mapDir },
        chunks: chunks.map((c, i) => ({
          hash: c.hash,
          auxiliaryFiles: [`${i}.js.map`],
        })),
        hooks: {
          processAssets: { tap: (_: unknown, fn: any) => (onAssets = fn) },
        },
        updateAsset: (name: string, source: { buffer: Buffer }) => {
          emitted[name] = JSON.parse(source.buffer.toString())
        },
      })
      onAssets(assets)
      return emitted
    }
    return { record, compile }
  }

  it('fills every map of a rebuild: again for a chunk that did not change, from the new map for one that did', () => {
    const { record, compile } = compiler()
    const sources = ['webpack://app/./src/routes/index.tsx']
    record(route, 'v1')
    expect(
      compile([{ hash: 'a', map: { sources, mappings: 'AAAA' } }]),
    ).toEqual({
      '0.js.map': { sources, sourcesContent: ['v1'], mappings: 'AAAA' },
    })
    expect(
      compile([{ hash: 'a', map: { sources, mappings: 'AAAA' } }]),
    ).toEqual({
      '0.js.map': { sources, sourcesContent: ['v1'], mappings: 'AAAA' },
    })
    expect(
      compile([{ hash: 'b', map: { sources, mappings: 'AACA' } }]),
    ).toEqual({
      '0.js.map': { sources, sourcesContent: ['v1'], mappings: 'AACA' },
    })
    // the file's text changed (a compile recorded it), the chunk did not
    record(route, 'v2')
    expect(
      compile([{ hash: 'b', map: { sources, mappings: 'AACA' } }]),
    ).toEqual({
      '0.js.map': { sources, sourcesContent: ['v2'], mappings: 'AACA' },
    })
  })
})
