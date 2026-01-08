import { describe, expect, it, vi } from 'vitest'
import { VITE_ENVIRONMENT_NAMES } from '../src/constants'

vi.mock('@tanstack/start-server-core', () => ({
  HEADERS: {
    TSS_SHELL: 'x-tss-shell',
  },
}))

vi.mock('../src/prerender', () => ({
  prerender: vi.fn(async () => {}),
}))

vi.mock('../src/build-sitemap', () => ({
  buildSitemap: vi.fn(),
}))

describe('postServerBuild', () => {
  const builder = {
    environments: {
      [VITE_ENVIRONMENT_NAMES.client]: {
        config: { build: { outDir: '/client' } },
      },
      [VITE_ENVIRONMENT_NAMES.server]: {
        config: { build: { outDir: '/server' } },
      },
    },
    config: {
      build: { outDir: '/root' },
    },
  } as any

  it('rejects absolute SPA maskPath URLs to avoid external prerendering', async () => {
    // Import after mocks are set up
    const { postServerBuild } = await import('../src/post-server-build')

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

    await expect(postServerBuild({ builder, startConfig })).rejects.toThrow(
      /maskPath/i,
    )
  })
})
