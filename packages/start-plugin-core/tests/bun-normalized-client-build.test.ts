import { describe, expect, it } from 'vitest'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  enrichBunClientBuildFromSourcemaps,
  normalizeBunClientBuild,
} from '../src/bun/normalized-client-build'

describe('normalizeBunClientBuild', () => {
  it('marks entry-point as the SSR entry chunk', () => {
    const build = normalizeBunClientBuild({
      clientOutDir: '/app/dist/client',
      outputs: [
        {
          path: '/app/dist/client/assets/main-abc.js',
          fileName: 'assets/main-abc.js',
          kind: 'entry-point',
        },
        {
          path: '/app/dist/client/assets/chunk-1.js',
          fileName: 'assets/chunk-1.js',
          kind: 'chunk',
        },
      ],
    })

    expect(build.entryChunkFileName).toBe('assets/main-abc.js')
    expect(build.chunksByFileName.get('assets/main-abc.js')?.isEntry).toBe(true)
    expect(build.chunksByFileName.size).toBe(2)
  })

  it('collects tsr-split route file paths from inputs', () => {
    const build = normalizeBunClientBuild({
      clientOutDir: '/app/dist/client',
      outputs: [
        {
          path: '/app/dist/client/assets/index.js',
          fileName: 'assets/index.js',
          kind: 'entry-point',
          inputs: [
            {
              path: '/app/src/routes/posts.tsx?tsr-split=component',
            },
          ],
        },
      ],
    })

    expect(
      build.chunksByFileName.get('assets/index.js')?.routeFilePaths,
    ).toEqual(['/app/src/routes/posts.tsx'])
    expect(
      build.chunkFileNamesByRouteFilePath.get('/app/src/routes/posts.tsx'),
    ).toEqual(['assets/index.js'])
  })

  it('enriches route file paths from linked sourcemap sources', async () => {
    const dir = join(tmpdir(), `bun-ncb-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const jsPath = join(dir, 'about.js')
    const mapPath = `${jsPath}.map`
    await writeFile(jsPath, 'export {}')
    await writeFile(
      mapPath,
      JSON.stringify({
        version: 3,
        sources: [
          'tsr-split:/app/src/routes/about.tsx?tsr-split=component',
        ],
        mappings: '',
      }),
    )

    const outputs = [
      {
        path: jsPath,
        fileName: 'about.js',
        kind: 'chunk' as const,
        sourcemapPath: mapPath,
      },
      {
        path: join(dir, 'main.js'),
        fileName: 'main.js',
        kind: 'entry-point' as const,
      },
    ]

    let build = normalizeBunClientBuild({
      clientOutDir: dir,
      outputs,
    })
    build = await enrichBunClientBuildFromSourcemaps({
      clientBuild: build,
      outputs,
    })

    expect(build.chunksByFileName.get('about.js')?.routeFilePaths).toEqual([
      '/app/src/routes/about.tsx',
    ])
    expect(
      build.chunkFileNamesByRouteFilePath.get('/app/src/routes/about.tsx'),
    ).toEqual(['about.js'])
  })

  it('wires emitted CSS into entry chunk and content map', () => {
    const build = normalizeBunClientBuild({
      clientOutDir: '/app/dist/client',
      outputs: [
        {
          path: '/app/dist/client/assets/main-abc.js',
          fileName: 'assets/main-abc.js',
          kind: 'entry-point',
        },
      ],
      emittedCssAssets: [
        {
          sourcePath: '/app/src/app.css',
          fileName: 'assets/app-deadbeef.css',
          css: 'body{color:red}',
        },
      ],
    })

    expect(build.cssContentByFileName.get('assets/app-deadbeef.css')).toBe(
      'body{color:red}',
    )
    expect(build.cssFilesBySourcePath.get('/app/src/app.css')).toEqual([
      'assets/app-deadbeef.css',
    ])
    expect(build.chunksByFileName.get('assets/main-abc.js')?.css).toEqual([
      'assets/app-deadbeef.css',
    ])
  })
})
