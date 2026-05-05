import { describe, expect, it, vi } from 'vitest'
import { runPrerenderParams } from '../src/prerender-params-runner'

const logger = {
  warn: vi.fn(),
}

function createRouteTree(optionsById: Record<string, any>) {
  return {
    options: {},
    children: Object.entries(optionsById).map(([id, options]) => ({
      id,
      fullPath: id,
      options: {
        id,
        ...options,
      },
    })),
  } as any
}

describe('runPrerenderParams', () => {
  it('expands dynamic route params into pages', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        sitemap: { priority: 0.7 },
        prerenderParams: () => [
          {
            params: { slug: 'hello-world' },
            sitemap: { lastmod: '2026-05-05' },
            prerender: { retryCount: 1 },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/posts/hello-world',
        sitemap: { priority: 0.7, lastmod: '2026-05-05' },
        prerender: { retryCount: 1 },
      },
    ])
  })

  it('supports multiple params, optional params, and splats', async () => {
    const routeTree = createRouteTree({
      '/posts/$category/$slug': {
        prerenderParams: () => [
          { params: { category: 'guides', slug: 'routing' } },
        ],
      },
      '/optional/{-$category}/{-$slug}': {
        prerenderParams: () => [
          { params: {} },
          { params: { category: 'guides' } },
          { params: { category: 'guides', slug: 'routing' } },
        ],
      },
      '/files/$': {
        prerenderParams: () => [
          { params: { _splat: 'docs/routing guide.md' } },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages.map((page) => page.path)).toEqual([
      '/posts/guides/routing',
      '/optional',
      '/optional/guides',
      '/optional/guides/routing',
      '/files/docs/routing%20guide.md',
    ])
  })

  it('encodes reserved characters in generated path params', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        prerenderParams: () => [
          { params: { slug: 'space + percent% [page] ?hash#' } },
        ],
      },
      '/files/$': {
        prerenderParams: () => [
          { params: { _splat: 'docs/routing guide/[page]?draft#intro' } },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages.map((page) => page.path)).toEqual([
      '/posts/space%20%2B%20percent%25%20%5Bpage%5D%20%3Fhash%23',
      '/files/docs/routing%20guide/%5Bpage%5D%3Fdraft%23intro',
    ])
  })

  it('preserves search params on generated pages', async () => {
    const routeTree = createRouteTree({
      '/products/$slug': {
        sitemap: { changefreq: 'daily' },
        prerenderParams: () => [
          {
            params: { slug: 'router' },
            search: { page: 2, tag: 'start' },
            sitemap: { priority: 0.4 },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/products/router?page=2&tag=start',
        sitemap: { changefreq: 'daily', priority: 0.4 },
        prerender: undefined,
      },
    ])
  })

  it('preserves advanced sitemap and prerender options on generated pages', async () => {
    const routeTree = createRouteTree({
      '/news/$slug': {
        sitemap: { changefreq: 'weekly' },
        prerenderParams: () => [
          {
            params: { slug: 'router-launch' },
            sitemap: {
              priority: 0.9,
              alternateRefs: [
                {
                  href: 'https://example.com/ko/news/router-launch',
                  hreflang: 'ko',
                },
              ],
              images: [
                {
                  loc: 'https://example.com/router.png',
                  title: 'Router',
                  caption: 'TanStack Router',
                },
              ],
              news: {
                publication: {
                  name: 'TanStack',
                  language: 'en',
                },
                publicationDate: '2026-05-05',
                title: 'Router Launch',
              },
            },
            prerender: {
              outputPath: '/custom-news/router-launch',
              autoSubfolderIndex: false,
              retryCount: 2,
            },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/news/router-launch',
        sitemap: {
          changefreq: 'weekly',
          priority: 0.9,
          alternateRefs: [
            {
              href: 'https://example.com/ko/news/router-launch',
              hreflang: 'ko',
            },
          ],
          images: [
            {
              loc: 'https://example.com/router.png',
              title: 'Router',
              caption: 'TanStack Router',
            },
          ],
          news: {
            publication: {
              name: 'TanStack',
              language: 'en',
            },
            publicationDate: '2026-05-05',
            title: 'Router Launch',
          },
        },
        prerender: {
          outputPath: '/custom-news/router-launch',
          autoSubfolderIndex: false,
          retryCount: 2,
        },
      },
    ])
  })

  it('serializes generated page search params with router defaults', async () => {
    const routeTree = createRouteTree({
      '/products/$slug': {
        prerenderParams: () => [
          {
            params: { slug: 'router' },
            search: {
              q: 'router start',
              page: 2,
              filters: { category: 'docs' },
              empty: undefined,
            },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages.map((page) => page.path)).toEqual([
      '/products/router?q=router+start&page=2&filters=%7B%22category%22%3A%22docs%22%7D',
    ])
  })

  it('passes routePath and an abort signal to async prerenderParams', async () => {
    const prerenderParams = vi.fn(async ({ routePath, signal }) => {
      expect(routePath).toBe('/products/$slug')
      expect(signal).toBeInstanceOf(AbortSignal)

      return [{ params: { slug: 'router' } }]
    })
    const routeTree = createRouteTree({
      '/products/$slug': {
        prerenderParams,
      },
    })

    await expect(
      runPrerenderParams({
        routeTree,
        pages: [],
        logger,
      }),
    ).resolves.toEqual([
      {
        path: '/products/router',
        sitemap: undefined,
        prerender: undefined,
      },
    ])
    expect(prerenderParams).toHaveBeenCalledTimes(1)
  })

  it('aborts prerenderParams when the timeout elapses', async () => {
    vi.useFakeTimers()
    try {
      const prerenderParams = vi.fn(({ signal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
        })
      })
      const routeTree = createRouteTree({
        '/products/$slug': {
          prerenderParams,
        },
      })

      const result = runPrerenderParams({
        routeTree,
        pages: [],
        logger,
        prerenderParamsTimeout: 100,
      })
      const expectation = expect(result).rejects.toThrow(
        'prerenderParams for route /products/$slug timed out',
      )

      await vi.advanceTimersByTimeAsync(100)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts prerenderParams when the process is interrupted', async () => {
    const prerenderParams = vi.fn(({ signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('signal aborted'))
        })
      })
    })
    const routeTree = createRouteTree({
      '/products/$slug': {
        prerenderParams,
      },
    })

    const result = runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })
    const expectation = expect(result).rejects.toThrow(
      'This operation was aborted',
    )

    process.emit('SIGTERM')
    await expectation
  })

  it('applies route sitemap options to static pages', async () => {
    const routeTree = createRouteTree({
      '/about': {
        sitemap: { changefreq: 'weekly' },
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [{ path: '/about', sitemap: { priority: 0.5 } }],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/about',
        sitemap: { priority: 0.5, changefreq: 'weekly' },
      },
    ])
  })

  it('lets existing pages take precedence over generated duplicates', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        sitemap: { priority: 0.3, changefreq: 'daily' },
        prerenderParams: () => [
          {
            params: { slug: 'hello-world' },
            sitemap: { priority: 0.7 },
            prerender: { retryCount: 1 },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [
        {
          path: '/posts/hello-world',
          sitemap: { changefreq: 'weekly' },
          prerender: { retryCount: 3 },
        },
      ],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/posts/hello-world',
        sitemap: { priority: 0.7, changefreq: 'weekly' },
        prerender: { retryCount: 3 },
      },
    ])
  })

  it('lets the first generated page take precedence over generated duplicates', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        sitemap: { changefreq: 'daily' },
        prerenderParams: () => [
          {
            params: { slug: 'hello-world' },
            sitemap: { priority: 0.7 },
            prerender: { retryCount: 1 },
          },
          {
            params: { slug: 'hello-world' },
            sitemap: { priority: 0.3, lastmod: '2026-05-05' },
            prerender: { retryCount: 3 },
          },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages).toEqual([
      {
        path: '/posts/hello-world',
        sitemap: {
          changefreq: 'daily',
          priority: 0.7,
          lastmod: '2026-05-05',
        },
        prerender: { retryCount: 1 },
      },
    ])
  })

  it('filters generated dynamic pages before sitemap generation', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        prerenderParams: () => [
          { params: { slug: 'keep' } },
          { params: { slug: 'drop' } },
        ],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
      filter: (page) => page.path !== '/posts/drop',
    })

    expect(pages.map((page) => page.path)).toEqual(['/posts/keep'])
  })

  it('warns and skips prerenderParams on static routes', async () => {
    logger.warn.mockClear()
    const routeTree = createRouteTree({
      '/about': {
        prerenderParams: () => [{ params: {} }],
      },
    })

    const pages = await runPrerenderParams({
      routeTree,
      pages: [],
      logger,
    })

    expect(pages).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping prerenderParams for static route /about; static routes are already discovered automatically.',
    )
  })

  it('throws when a prerenderParams entry is missing required params', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        prerenderParams: () => [{ params: {} }],
      },
    })

    await expect(
      runPrerenderParams({
        routeTree,
        pages: [],
        logger,
      }),
    ).rejects.toThrow('Missing prerenderParams values for route /posts/$slug')
  })

  it('throws when a prerenderParams entry has nullish required params', async () => {
    const routeTree = createRouteTree({
      '/posts/$slug': {
        prerenderParams: () => [
          { params: { slug: undefined } },
          { params: { slug: null } },
        ],
      },
    })

    await expect(
      runPrerenderParams({
        routeTree,
        pages: [],
        logger,
      }),
    ).rejects.toThrow('Missing prerenderParams values for route /posts/$slug')
  })

  it('returns existing pages when no prerender route tree is available', async () => {
    const pages = [{ path: '/about', sitemap: { priority: 0.5 } }]

    await expect(
      runPrerenderParams({
        routeTree: undefined,
        pages,
        logger,
      }),
    ).resolves.toEqual(pages)
  })
})
