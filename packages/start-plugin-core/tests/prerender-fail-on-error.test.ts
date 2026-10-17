import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import { parseStartConfig } from '../src/schema'

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

describe('prerender failOnError', () => {
  it('stops requesting queued pages after a page fails', async () => {
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
    const startConfig = parseStartConfig(
      {
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
          concurrency: 1,
        },
        pages: [{ path: '/missing' }, { path: '/about' }],
      },
      { framework: 'react' },
      process.cwd(),
    )

    await expect(
      prerender({
        startConfig,
        handler: { getClientOutputDirectory: () => publicDir, request },
      }),
    ).rejects.toThrow('Failed to fetch /missing: Not Found')
    expect(request.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      '/missing/',
    ])
  })
})
