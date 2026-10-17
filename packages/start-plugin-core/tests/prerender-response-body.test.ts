import { promises as fsp } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
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

// A JPEG header contains bytes that are not valid UTF-8.
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
])

describe('prerender response body', () => {
  it('writes a binary response without re-encoding it', async () => {
    vi.mocked(fsp.writeFile).mockClear()
    const request = vi.fn(
      async () =>
        new Response(jpeg, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    )

    await prerender({
      startConfig: makeStartConfig('/og-image.jpg'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(fsp.writeFile).toHaveBeenCalledExactlyOnceWith(
      '/client/og-image.jpg',
      Buffer.from(jpeg),
    )
  })

  it('still writes HTML responses as text', async () => {
    vi.mocked(fsp.writeFile).mockClear()
    const request = vi.fn(
      async () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    )

    await prerender({
      startConfig: makeStartConfig('/about'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(fsp.writeFile).toHaveBeenCalledExactlyOnceWith(
      '/client/about/index.html',
      '<html></html>',
    )
  })
})
