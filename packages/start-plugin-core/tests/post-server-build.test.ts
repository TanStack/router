import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/start-server-core', () => ({
  HEADERS: {
    TSS_SHELL: 'x-tss-shell',
  },
}))

vi.mock('../src/build-sitemap', () => ({
  buildSitemap: vi.fn(),
}))

describe('postServerBuild', () => {
  it('does not enable prerendering when pages array is empty and prerender config is absent', async () => {
    const prerender = vi.fn(async () => {})
    const { postBuild } = await import('../src/post-build')

    await postBuild({
      startConfig: {
        pages: [],
        router: { basepath: '' },
        serverFns: { base: '' },
        spa: { enabled: false },
        sitemap: { enabled: false },
      } as any,
      adapter: {
        getClientOutputDirectory: () => '/client',
        prerender,
      },
    })

    expect(prerender).not.toHaveBeenCalled()
  })

  it('rejects absolute SPA maskPath URLs to avoid external prerendering', async () => {
    const prerender = vi.fn(async () => {})
    const { postBuild } = await import('../src/post-build')

    const startConfig = {
      spa: {
        enabled: true,
        maskPath: 'https://attacker.test/collect',
        prerender: {},
      },
      pages: [],
      router: { basepath: '' },
      serverFns: { base: '' },
      prerender: { enabled: true },
      sitemap: { enabled: false },
    } as any

    await expect(
      postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => '/client',
          prerender,
        },
      }),
    ).rejects.toThrow(/maskPath/i)

    expect(prerender).not.toHaveBeenCalled()
  })

  it('keeps explicit prerender pages in SPA mode', async () => {
    const prerender = vi.fn(async () => {})
    const { postBuild } = await import('../src/post-build')

    const startConfig = {
      spa: {
        enabled: true,
        maskPath: '/',
        prerender: {},
      },
      pages: [{ path: '/about', prerender: { enabled: true } }],
      router: { basepath: '' },
      serverFns: { base: '' },
      sitemap: { enabled: false },
    } as any

    await postBuild({
      startConfig,
      adapter: {
        getClientOutputDirectory: () => '/client',
        prerender,
      },
    })

    expect(prerender).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            path: '/about',
          }),
          expect.objectContaining({
            path: '/',
          }),
        ],
        prerender: expect.objectContaining({
          enabled: true,
        }),
      }),
    )
  })

  it('limits SPA-only prerendering to the shell page', async () => {
    const prerender = vi.fn(async () => {})
    const { postBuild } = await import('../src/post-build')

    const startConfig = {
      spa: {
        enabled: true,
        maskPath: '/',
        prerender: {},
      },
      pages: [{ path: '/about' }],
      router: { basepath: '' },
      serverFns: { base: '' },
      sitemap: { enabled: false },
    } as any

    await postBuild({
      startConfig,
      adapter: {
        getClientOutputDirectory: () => '/client',
        prerender,
      },
    })

    expect(prerender).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            path: '/',
          }),
        ],
        prerender: expect.objectContaining({
          enabled: true,
          autoStaticPathsDiscovery: false,
        }),
      }),
    )
  })
})
