import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prerender } from '../src/prerender'
import type { PrerenderHandler } from '../src/prerender'

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]

function makeStartConfig(pages: Array<string>) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      failOnError: true,
    },
    pages: pages.map((p) => ({ path: p })),
    router: { basepath: '' },
    spa: {
      enabled: false,
      prerender: {
        outputPath: '/_shell',
        crawlLinks: false,
        retryCount: 0,
        enabled: false,
      },
    },
  } as any
}

describe('prerender binary responses', () => {
  let outputDir: string

  beforeEach(async () => {
    outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ts-prerender-bin-'))
  })

  afterEach(async () => {
    await fsp.rm(outputDir, { recursive: true, force: true })
  })

  it('writes a non-UTF-8 response body without corrupting its bytes', async () => {
    const body = new Uint8Array([...JPEG_MAGIC, 0xff, 0xd9])

    const handler: PrerenderHandler = {
      getClientOutputDirectory: () => outputDir,
      request: async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    }

    await prerender({
      startConfig: makeStartConfig(['/og-image.jpg']),
      handler,
    })

    const written = await fsp.readFile(path.join(outputDir, 'og-image.jpg'))

    expect([...written.subarray(0, JPEG_MAGIC.length)]).toEqual(JPEG_MAGIC)
  })

  it('writes raw bytes when a binary response is given an .html output path', async () => {
    const body = new Uint8Array([...JPEG_MAGIC, 0xff, 0xd9])

    const handler: PrerenderHandler = {
      getClientOutputDirectory: () => outputDir,
      request: async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    }

    const startConfig = makeStartConfig(['/image'])
    startConfig.pages[0].prerender = { outputPath: '/image.html' }

    await prerender({ startConfig, handler })

    const written = await fsp.readFile(path.join(outputDir, 'image.html'))

    expect([...written.subarray(0, JPEG_MAGIC.length)]).toEqual(JPEG_MAGIC)
  })

  it('treats a mixed-case HTML content type as HTML', async () => {
    const html = '<html><body><a href="/about">About</a></body></html>'
    const requested: Array<string> = []

    const handler: PrerenderHandler = {
      getClientOutputDirectory: () => outputDir,
      request: async (requestPath) => {
        requested.push(requestPath)
        return new Response(
          requestPath.replace(/\/$/, '') === '/about'
            ? '<html><body>About</body></html>'
            : html,
          {
            status: 200,
            headers: { 'content-type': 'Text/HTML; charset=utf-8' },
          },
        )
      },
    }

    const onSuccessCalls: Array<{ path: string; html: string }> = []

    const startConfig = makeStartConfig(['/'])
    startConfig.prerender.onSuccess = (opts: any) => {
      onSuccessCalls.push({ path: opts.page.path, html: opts.html })
      return undefined
    }
    startConfig.prerender.crawlLinks = true

    await prerender({ startConfig, handler })

    const written = await fsp.readFile(
      path.join(outputDir, 'index.html'),
      'utf8',
    )

    expect(written).toBe(html)
    expect(onSuccessCalls).toContainEqual({ path: '/', html })
    expect(requested.some((p) => p.replace(/\/$/, '') === '/about')).toBe(true)
  })
})
