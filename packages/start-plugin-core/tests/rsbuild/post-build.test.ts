import { beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'

vi.mock('@tanstack/start-server-core', () => ({
  HEADERS: {
    TSS_SHELL: 'x-tss-shell',
  },
}))

describe('postBuildWithRsbuild', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as any).__ROUTE_OPTIONS_LOADED
    delete process.env.TSS_PRERENDERING
    delete process.env.TSS_CLIENT_OUTPUT_DIR
  })

  it('imports server/index.js and accepts object fetch handlers', async () => {
    const serverOutputDirectory = await mkdtemp(join(tmpdir(), 'tss-rsbuild-'))
    const prerenderSpy = vi.fn(async ({ handler }: any) => {
      const response = await handler.request('/posts')
      expect(await response.text()).toBe('ok')
    })

    vi.doMock('../../src/prerender', async () => {
      const actual = await vi.importActual<any>('../../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await writeFile(
      join(serverOutputDirectory, 'index.js'),
      [
        'export default {',
        '  fetch() {',
        "    return new Response('ok')",
        '  },',
        '}',
      ].join('\n'),
    )

    const { postBuildWithRsbuild } =
      await import('../../src/rsbuild/post-build')

    try {
      await postBuildWithRsbuild({
        startConfig: {
          prerender: { enabled: true, autoStaticPathsDiscovery: false },
          pages: [{ path: '/posts' }],
          router: { basepath: '' },
          spa: { enabled: false, prerender: { outputPath: '/_shell' } },
          sitemap: { enabled: false },
        } as any,
        clientOutputDirectory: '/client',
        serverOutputDirectory,
        separatePrerenderRouteOptions: false,
      })

      expect(prerenderSpy).toHaveBeenCalledOnce()
    } finally {
      await rm(serverOutputDirectory, { recursive: true, force: true })
    }
  })

  it('imports route options from the prerender bundle and removes it', async () => {
    const serverOutputDirectory = await mkdtemp(join(tmpdir(), 'tss-rsbuild-'))
    const prerenderOutputDirectory = join(serverOutputDirectory, 'custom-prerender')
    const prerenderSpy = vi.fn(async ({ handler }: any) => {
      expect((globalThis as any).__ROUTE_OPTIONS_LOADED).toBe(true)
      const response = await handler.request('/posts')
      expect(await response.text()).toBe('ok')
      await handler.close()
    })

    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(prerenderOutputDirectory, { recursive: true })
    await writeFile(
      join(serverOutputDirectory, 'index.js'),
      [
        'export default {',
        '  fetch() {',
        "    return new Response(globalThis.__ROUTE_OPTIONS_LOADED ? 'ok' : 'missing')",
        '  },',
        '}',
      ].join('\n'),
    )
    await writeFile(
      join(prerenderOutputDirectory, 'index.js'),
      'globalThis.__ROUTE_OPTIONS_LOADED = true',
    )

    const { postBuildWithRsbuild } = await import('../src/rsbuild/post-build')

    try {
      await postBuildWithRsbuild({
        startConfig: {
          prerender: { enabled: true, autoStaticPathsDiscovery: false },
          pages: [{ path: '/posts' }],
          router: { basepath: '' },
          spa: { enabled: false, prerender: { outputPath: '/_shell' } },
          sitemap: { enabled: false },
        } as any,
        clientOutputDirectory: '/client',
        serverOutputDirectory,
        prerenderOutputDirectory,
        separatePrerenderRouteOptions: true,
      })

      expect(prerenderSpy).toHaveBeenCalledOnce()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      await expect(access(prerenderOutputDirectory)).rejects.toThrow()
    } finally {
      await rm(serverOutputDirectory, { recursive: true, force: true })
    }
  })

  it('cleans up route options and env vars if request handler preload fails', async () => {
    const serverOutputDirectory = await mkdtemp(join(tmpdir(), 'tss-rsbuild-'))
    const prerenderOutputDirectory = join(serverOutputDirectory, 'custom-prerender')
    const prerenderSpy = vi.fn()

    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(prerenderOutputDirectory, { recursive: true })
    await writeFile(
      join(prerenderOutputDirectory, 'index.js'),
      'globalThis.__ROUTE_OPTIONS_LOADED = true',
    )

    const { postBuildWithRsbuild } = await import('../src/rsbuild/post-build')

    try {
      await expect(
        postBuildWithRsbuild({
          startConfig: {
            prerender: { enabled: true, autoStaticPathsDiscovery: false },
            pages: [{ path: '/posts' }],
            router: { basepath: '' },
            spa: { enabled: false, prerender: { outputPath: '/_shell' } },
            sitemap: { enabled: false },
          } as any,
          clientOutputDirectory: '/client',
          serverOutputDirectory,
          prerenderOutputDirectory,
          separatePrerenderRouteOptions: true,
        }),
      ).rejects.toThrow()

      expect(prerenderSpy).not.toHaveBeenCalled()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
      await expect(access(prerenderOutputDirectory)).rejects.toThrow()
    } finally {
      await rm(serverOutputDirectory, { recursive: true, force: true })
    }
  })
})
