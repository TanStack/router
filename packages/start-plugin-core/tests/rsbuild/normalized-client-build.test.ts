import { describe, expect, test } from 'vitest'
import { normalizeRspackClientBuild } from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { Rspack } from '@rsbuild/core'

function makeModule(options: {
  identifier: string
  nameForCondition?: string | null
}): Rspack.Module {
  return {
    identifier: () => options.identifier,
    nameForCondition: () => options.nameForCondition ?? null,
  } as unknown as Rspack.Module
}

function makeChunk(options: {
  name: string
  files: Array<string>
  auxiliaryFiles?: Array<string>
}): Rspack.Chunk {
  const chunk = {
    name: options.name,
    files: new Set(options.files),
    auxiliaryFiles: new Set(options.auxiliaryFiles ?? []),
  } as unknown as Rspack.Chunk

  const group = {
    chunks: [chunk],
    childrenIterable: new Set(),
  }

  ;(chunk as any).groupsIterable = new Set([group])

  return chunk
}

function makeCompilation(
  entries: Array<{ chunk: Rspack.Chunk; modules: Array<Rspack.Module> }>,
): Rspack.Compilation {
  const entryChunk = entries.find((entry) => entry.chunk.name === 'index')!
  const modulesByChunk = new Map(
    entries.map((entry) => [entry.chunk, entry.modules]),
  )

  return {
    entrypoints: new Map([['index', { chunks: [entryChunk.chunk] }]]),
    chunks: new Set(entries.map((entry) => entry.chunk)),
    chunkGraph: {
      getChunkModules: (chunk: Rspack.Chunk) => modulesByChunk.get(chunk) ?? [],
    },
    getAssets: () => [],
  } as unknown as Rspack.Compilation
}

function makeWindowsCompilation() {
  return makeCompilation([
    {
      chunk: makeChunk({ name: 'index', files: ['index.js'] }),
      modules: [makeModule({ identifier: 'C:\\app\\src\\client.tsx' })],
    },
    {
      chunk: makeChunk({
        name: 'posts',
        files: ['posts.js'],
        auxiliaryFiles: ['posts.css'],
      }),
      modules: [
        makeModule({
          identifier:
            'builtin:swc-loader??ruleSet[0]!C:\\app\\src\\routes\\posts.tsx?tsr-split=component',
          nameForCondition: 'C:\\app\\src\\routes\\posts.tsx',
        }),
      ],
    },
  ])
}

describe('normalizeRspackClientBuild', () => {
  test('keys route chunks by a POSIX path when rspack reports OS native paths', () => {
    const build = normalizeRspackClientBuild(makeWindowsCompilation())

    expect([...build.chunkFileNamesByRouteFilePath.keys()]).toEqual([
      'C:/app/src/routes/posts.tsx',
    ])
    expect(build.chunksByFileName.get('posts.js')?.routeFilePaths).toEqual([
      'C:/app/src/routes/posts.tsx',
    ])
  })

  test('gives a route its stylesheet when rspack reports OS native paths', () => {
    const manifest = buildStartManifest({
      clientBuild: normalizeRspackClientBuild(makeWindowsCompilation()),
      routeTreeRoutes: {
        __root__: {
          filePath: 'C:/app/src/routes/__root.tsx',
          children: ['/posts'],
        },
        '/posts': { filePath: 'C:/app/src/routes/posts.tsx', children: [] },
      },
      basePath: '/',
    })

    expect(manifest.routes['/posts']?.css).toEqual(['/posts.css'])
    expect(manifest.routes['/posts']?.preloads).toEqual(['/posts.js'])
  })
})
