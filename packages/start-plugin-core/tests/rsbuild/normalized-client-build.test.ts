import { describe, expect, test, vi } from 'vitest'
import {
  normalizeRspackClientBuild,
  registerClientBuildCapture,
} from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { GetConfigFn } from '../../src/types'

function makeCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = vi.fn(() => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ])
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk
          ? [
              {
                identifier: () => '/routes/posts.tsx?tsr-split=component',
                nameForCondition: () => '/routes/posts.tsx',
              },
            ]
          : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return { compilation, getAssets }
}

describe('normalizeRspackClientBuild', () => {
  test('keeps route stylesheet links without reading CSS content by default', () => {
    const readCss = vi.fn(() => new Uint8Array(1024 * 1024))
    const { compilation, getAssets } = makeCompilation(readCss)
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: '/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(readCss).not.toHaveBeenCalled()
    expect(getAssets).not.toHaveBeenCalled()
    expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.inlineCss).toBeUndefined()
  })

  test.each([false, true])(
    'captures inline CSS according to the resolved config (%s)',
    (enabled) => {
      const readCss = vi.fn(() =>
        Buffer.from('.card{background:url(./dot.svg)}'),
      )
      const { compilation, getAssets } = makeCompilation(readCss)
      const processAssets = vi.fn<RsbuildPluginAPI['processAssets']>()
      const getConfig = vi.fn(() => ({
        startConfig: { server: { build: { inlineCss: { enabled } } } },
      }))
      const { getClientBuild } = registerClientBuildCapture(
        { processAssets } as unknown as RsbuildPluginAPI,
        getConfig as unknown as GetConfigFn,
      )

      expect(getConfig).not.toHaveBeenCalled()
      const [options, capture] = processAssets.mock.calls[0]!
      expect(options).toEqual({ stage: 'report', environments: ['client'] })
      capture({ compilation } as Parameters<typeof capture>[0])

      const manifest = buildStartManifest({
        clientBuild: getClientBuild()!,
        routeTreeRoutes: {
          __root__: {},
          '/posts': { filePath: '/routes/posts.tsx' },
        },
        basePath: '/assets',
        inlineCss: { enabled, transformAssets: false },
      })

      expect(getAssets).toHaveBeenCalledTimes(enabled ? 1 : 0)
      expect(readCss).toHaveBeenCalledTimes(enabled ? 2 : 0)
      expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
      expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
      if (enabled) {
        expect(manifest.inlineCss?.styles).toEqual({
          '/assets/root.css': '.card{background:url(/assets/dot.svg)}',
          '/assets/posts.css': '.card{background:url(/assets/dot.svg)}',
        })
      } else {
        expect(manifest.inlineCss).toBeUndefined()
      }
    },
  )
})
