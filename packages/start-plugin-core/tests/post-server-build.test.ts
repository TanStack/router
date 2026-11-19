import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/start-server-core/constants', () => ({
  HEADERS: {
    TSS_SHELL: 'x-tss-shell',
  },
}))

vi.mock('../src/build-sitemap', () => ({
  buildSitemap: vi.fn(),
}))

describe('postServerBuild', () => {
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

  it('resolves the client output directory against the Vite root', async () => {
    vi.resetModules()
    const postBuild = vi.fn(async () => {})
    vi.doMock('../src/post-build', () => ({ postBuild }))
    const { postServerBuild } = await import('../src/vite/post-server-build')

    await postServerBuild({
      builder: {
        config: { root: '/app', build: { outDir: 'dist' } },
      } as any,
      startConfig: {} as any,
    })

    const [{ adapter }] = postBuild.mock.calls[0] as any
    expect(adapter.getClientOutputDirectory()).toBe('/app/dist/client')

    vi.doUnmock('../src/post-build')
  })
})
