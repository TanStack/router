import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import { parseStartConfig } from '../src/schema'
import type { TanStackStartInputConfig } from '../src/schema'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

const publicDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(
    publicDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function prerenderPages(config: TanStackStartInputConfig) {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-prerender-fail-'))
  publicDirs.push(publicDir)
  const request = vi.fn(async (requestPath: string) => {
    if (requestPath === '/missing/') {
      return new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      })
    }
    return new Response(`<html><body>${requestPath}</body></html>`, {
      headers: { 'content-type': 'text/html' },
    })
  })
  const close = vi.fn(async () => {})
  const startConfig = parseStartConfig(
    {
      ...config,
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        concurrency: 1,
        ...config.prerender,
      },
    },
    { framework: 'react' },
    process.cwd(),
  )

  const result = prerender({
    startConfig,
    handler: { getClientOutputDirectory: () => publicDir, request, close },
  })

  return {
    result,
    request,
    close,
    read: (file: string) => readFile(path.join(publicDir, file), 'utf8'),
  }
}

describe('prerender failOnError', () => {
  it('rejects with the page error and closes the handler', async () => {
    const { result, close } = await prerenderPages({
      pages: [{ path: '/missing' }],
    })

    await expect(result).rejects.toThrow('Failed to fetch /missing: Not Found')
    expect(close).toHaveBeenCalledOnce()
  })

  it('stops requesting queued pages after a page fails', async () => {
    const { result, request } = await prerenderPages({
      pages: [{ path: '/missing' }, { path: '/about' }],
    })

    await expect(result).rejects.toThrow('Failed to fetch /missing: Not Found')
    expect(request.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      '/missing/',
    ])
  })

  it('skips a failing page and keeps prerendering when disabled', async () => {
    const { result, read } = await prerenderPages({
      prerender: { failOnError: false },
      pages: [{ path: '/missing' }, { path: '/about' }],
    })

    await expect(result).resolves.toBeUndefined()
    await expect(read('about/index.html')).resolves.toBe(
      '<html><body>/about/</body></html>',
    )
    await expect(read('missing/index.html')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
