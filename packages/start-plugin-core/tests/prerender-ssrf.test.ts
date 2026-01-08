import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import { VITE_ENVIRONMENT_NAMES } from '../src/constants'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

vi.mock('../src/prerender', async () => {
  const actual = await vi.importActual<any>('../src/prerender')
  return {
    ...actual,
  }
})

const builder = {
  environments: {
    [VITE_ENVIRONMENT_NAMES.client]: {
      config: { build: { outDir: '/client' } },
    },
    [VITE_ENVIRONMENT_NAMES.server]: {
      config: { build: { outDir: '/server' } },
    },
  },
} as any

const fetchMock = vi.fn(
  async () => new Response('<html></html>', { status: 200 }),
)

vi.stubGlobal('fetch', fetchMock)

function resetFetch() {
  fetchMock.mockClear()
}

function makeStartConfig(pagePath: string) {
  return {
    prerender: { enabled: true, autoStaticPathsDiscovery: false },
    pages: [{ path: pagePath }],
    router: { basepath: '' },
    spa: { enabled: false },
  } as any
}

describe('prerender pages validation', () => {
  it('rejects absolute external page paths to avoid SSRF', async () => {
    resetFetch()
    const startConfig = makeStartConfig('https://attacker.test/leak')

    await expect(prerender({ startConfig, builder })).rejects.toThrow(
      /prerender page path must be relative/i,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows relative paths', async () => {
    resetFetch()
    const startConfig = makeStartConfig('/about')

    await expect(prerender({ startConfig, builder })).resolves.not.toThrow()
  })
})
