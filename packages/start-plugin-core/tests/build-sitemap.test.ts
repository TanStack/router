import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSitemap } from '../src/build-sitemap'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

const originalSourceDateEpoch = process.env.SOURCE_DATE_EPOCH

function restoreSourceDateEpoch() {
  if (originalSourceDateEpoch === undefined) {
    delete process.env.SOURCE_DATE_EPOCH
  } else {
    process.env.SOURCE_DATE_EPOCH = originalSourceDateEpoch
  }
}

function makeStartConfig() {
  return {
    sitemap: {
      enabled: true,
      host: 'https://example.com',
      outputPath: 'sitemap.xml',
    },
    pages: [
      { path: '/' },
      { path: '/about', sitemap: { lastmod: '2024-02-03' } },
    ],
  } as any
}

function build(): { sitemap: string; pages: { lastBuilt: string } } {
  const publicDir = mkdtempSync(path.join(tmpdir(), 'tss-sitemap-'))
  try {
    buildSitemap({ startConfig: makeStartConfig(), publicDir })
    return {
      sitemap: readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8'),
      pages: JSON.parse(
        readFileSync(path.join(publicDir, 'pages.json'), 'utf8'),
      ),
    }
  } finally {
    rmSync(publicDir, { recursive: true, force: true })
  }
}

beforeEach(() => {
  delete process.env.SOURCE_DATE_EPOCH
})

afterEach(() => {
  vi.useRealTimers()
  restoreSourceDateEpoch()
})

describe('buildSitemap', () => {
  it('stamps lastmod and lastBuilt from SOURCE_DATE_EPOCH when it is set', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000' // 2023-11-14T22:13:20Z

    const { sitemap, pages } = build()

    expect(sitemap).toContain('<loc>https://example.com/</loc>')
    expect(sitemap).toContain('<lastmod>2023-11-14</lastmod>')
    // A page's own lastmod still wins over the build time.
    expect(sitemap).toContain('<lastmod>2024-02-03</lastmod>')
    expect(pages.lastBuilt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('writes byte-identical output across builds under the same SOURCE_DATE_EPOCH', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000'

    const first = build()
    const second = build()

    expect(second.sitemap).toBe(first.sitemap)
    expect(second.pages.lastBuilt).toBe(first.pages.lastBuilt)
  })

  it('falls back to the current time without SOURCE_DATE_EPOCH', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-07T08:09:10Z'))

    const { sitemap, pages } = build()

    expect(sitemap).toContain('<lastmod>2025-06-07</lastmod>')
    expect(pages.lastBuilt).toBe('2025-06-07T08:09:10.000Z')
  })

  it('ignores a SOURCE_DATE_EPOCH beyond the range a Date can represent', () => {
    // 8640000000001 s is past Date's ±8.64e15 ms limit: an Invalid Date, whose
    // toISOString() would throw.
    process.env.SOURCE_DATE_EPOCH = '8640000000001'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-07T08:09:10Z'))

    const { sitemap, pages } = build()

    expect(sitemap).toContain('<lastmod>2025-06-07</lastmod>')
    expect(pages.lastBuilt).toBe('2025-06-07T08:09:10.000Z')
  })

  it('ignores a SOURCE_DATE_EPOCH that is not a whole number of seconds', () => {
    process.env.SOURCE_DATE_EPOCH = 'yesterday'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-07T08:09:10Z'))

    const { sitemap } = build()

    expect(sitemap).toContain('<lastmod>2025-06-07</lastmod>')
  })
})
