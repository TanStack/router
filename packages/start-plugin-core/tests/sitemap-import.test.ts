import { describe, expect, it, vi } from 'vitest'

vi.mock('xmlbuilder2', () => {
  throw new Error('XML dependencies should only load when generating a sitemap')
})

describe('plugin startup', () => {
  it('loads the Vite entry without XML dependencies', async () => {
    const { tanStackStartVite } = await import('../src/vite')
    expect(tanStackStartVite).toBeTypeOf('function')
  })

  it('loads the Rsbuild entry without XML dependencies', async () => {
    const { tanStackStartRsbuild } = await import('../src/rsbuild')
    expect(tanStackStartRsbuild).toBeTypeOf('function')
  })

  it('skips XML dependencies when sitemap generation is disabled', async () => {
    const { postBuild } = await import('../src/post-build')
    const { parseStartConfig } = await import('../src/schema')
    const getClientOutputDirectory = vi.fn()
    await postBuild({
      startConfig: parseStartConfig(
        { sitemap: { enabled: false } },
        { framework: 'react' },
        process.cwd(),
      ),
      adapter: { getClientOutputDirectory, prerender: vi.fn() },
    })
    expect(getClientOutputDirectory).not.toHaveBeenCalled()
  })
})
