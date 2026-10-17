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

const aboutDocument = '<html><body>about</body></html>'

const publicDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(
    publicDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function prerenderAbout(
  prerenderOptions: NonNullable<TanStackStartInputConfig['prerender']>,
  failures: number,
) {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-prerender-retry-'))
  publicDirs.push(publicDir)
  const request = vi.fn(async () => {
    if (request.mock.calls.length <= failures) {
      return new Response('Server Error', { status: 500 })
    }
    return new Response(aboutDocument, {
      headers: { 'content-type': 'text/html' },
    })
  })
  const startConfig = parseStartConfig(
    {
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        retryDelay: 0,
        ...prerenderOptions,
      },
      pages: [{ path: '/about' }],
    },
    { framework: 'react' },
    process.cwd(),
  )

  const result = prerender({
    startConfig,
    handler: { getClientOutputDirectory: () => publicDir, request },
  })

  return {
    result,
    request,
    readAbout: () => readFile(path.join(publicDir, 'about/index.html'), 'utf8'),
  }
}

describe('prerender retries', () => {
  it('writes a page that succeeds on a retry', async () => {
    const { result, request, readAbout } = await prerenderAbout(
      { retryCount: 2 },
      1,
    )

    await expect(result).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
    await expect(readAbout()).resolves.toBe(aboutDocument)
  })

  it('requests a failing page once per allowed retry before skipping it', async () => {
    const { result, request, readAbout } = await prerenderAbout(
      { retryCount: 2, failOnError: false },
      Infinity,
    )

    await expect(result).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledTimes(3)
    await expect(readAbout()).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
