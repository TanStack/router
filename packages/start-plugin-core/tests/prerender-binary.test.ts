import { promises as fsp } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function makeStartConfig(pagePath: string) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      crawlLinks: false,
    },
    pages: [{ path: pagePath }],
    router: { basepath: '' },
    spa: {
      enabled: false,
      prerender: {
        outputPath: '/_shell',
        crawlLinks: false,
        retryCount: 0,
        enabled: true,
      },
    },
  } as any
}

// JPEG header bytes: 0xff / 0xd8 / 0xe0 are not valid UTF-8 on their own.
const jpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
])

describe('prerender response bodies', () => {
  beforeEach(() => {
    vi.mocked(fsp.writeFile).mockClear()
  })

  it('writes binary responses byte-for-byte', async () => {
    const request = vi.fn(
      async () =>
        new Response(jpegBytes, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    )

    await prerender({
      startConfig: makeStartConfig('/og-image.jpg'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(fsp.writeFile).toHaveBeenCalledTimes(1)
    const [filepath, written] = vi.mocked(fsp.writeFile).mock.calls[0]!
    expect(filepath).toBe('/client/og-image.jpg')
    expect(Array.from(written as Uint8Array)).toEqual(Array.from(jpegBytes))
  })

  it('still passes HTML to onSuccess and writes it unchanged', async () => {
    const html = '<html><body>héllo</body></html>'
    const onSuccess = vi.fn()
    const request = vi.fn(
      async () =>
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const startConfig = makeStartConfig('/about')
    startConfig.prerender.onSuccess = onSuccess

    await prerender({
      startConfig,
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ html }))
    const [filepath, written] = vi.mocked(fsp.writeFile).mock.calls[0]!
    expect(filepath).toBe('/client/about/index.html')
    expect(Buffer.from(written as Uint8Array).toString('utf8')).toBe(html)
  })
})
