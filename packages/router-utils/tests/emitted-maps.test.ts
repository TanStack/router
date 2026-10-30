import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fillSourcesContent } from '../src/compiler'

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
