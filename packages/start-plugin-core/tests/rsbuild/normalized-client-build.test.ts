import { describe, expect, test } from 'vitest'
import { normalizeRspackClientBuild } from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { Rspack } from '@rsbuild/core'

// Rspack reports module paths using the OS native separator on Windows
// (e.g. `C:\app\src\routes\posts.tsx`), while the generated route tree always
// records `filePath` with POSIX separators. This compilation mimics that
// Windows output so we can verify the route still keys its chunk correctly.
function makeWindowsCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
    runtime: new Set(['index']),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
    runtime: new Set(['index']),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    moduleGraph: { getConnection: () => undefined },
    chunkGraph: {
      getModuleChunksIterable: () => [],
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk
          ? [
              {
                dependencies: [],
                identifier: () =>
                  'builtin:swc-loader??ruleSet[0]!C:\\app\\src\\routes\\posts.tsx?tsr-split=component',
                nameForCondition: () => 'C:\\app\\src\\routes\\posts.tsx',
              },
            ]
          : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

describe('normalizeRspackClientBuild', () => {
  test('keys the route chunk by a POSIX path when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)

    expect(
      clientBuild.chunksByFileName.get('posts.js')?.routeFilePaths,
    ).toEqual(['C:/app/src/routes/posts.tsx'])
  })

  test('gives a route its stylesheet and preload when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: 'C:/app/src/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.routes['/posts']?.preloads).toEqual(['/assets/posts.js'])
  })
})
