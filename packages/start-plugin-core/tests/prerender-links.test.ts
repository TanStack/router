import { describe, expect, it } from 'vitest'
import {
  extractLinks,
  validateAndNormalizePrerenderPages,
} from '../src/prerender'

const routerBaseUrl = new URL('http://127.0.0.1:4173/')

describe('extractLinks', () => {
  it('returns internal links without their fragments', () => {
    const html = `
      <a href="/">Home</a>
      <a href="/#mission">Mission</a>
      <a href="/docs#install">Install</a>
      <a href="./about#team">Team</a>
      <a href="https://example.com/#x">External</a>
      <a href="#top">Top</a>
    `
    expect(extractLinks(html)).toEqual(['/', '/', '/docs', './about'])
  })
})

describe('validateAndNormalizePrerenderPages', () => {
  it('drops a fragment from a declared page path', () => {
    const pages = validateAndNormalizePrerenderPages(
      [{ path: '/#mission' }, { path: '/docs?v=2#install' }],
      routerBaseUrl,
    )
    expect(pages.map((page) => page.path)).toEqual(['/', '/docs?v=2'])
  })

  it('keeps one entry, the first, for pages that normalize to the same path', () => {
    const pages = validateAndNormalizePrerenderPages(
      [
        { path: '/', sitemap: { priority: 0.9 } },
        { path: '/#mission', sitemap: { priority: 0.1 } },
        { path: '/docs#a' },
        { path: '/docs#b' },
      ],
      routerBaseUrl,
    )
    expect(pages).toEqual([
      { path: '/', sitemap: { priority: 0.9 } },
      { path: '/docs' },
    ])
  })
})
