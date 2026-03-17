import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

const createAboutRouter = (opts: {
  initialEntries: Array<string>
  origin: string
  rewrite: NonNullable<ConstructorParameters<typeof RouterCore>[0]['rewrite']>
}) => {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })

  const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

  return new RouterCore({
    routeTree,
    history: createMemoryHistory({ initialEntries: opts.initialEntries }),
    origin: opts.origin,
    rewrite: opts.rewrite,
  })
}

describe('rewrite origin behavior', () => {
  test('parseLocation keeps a public url when input rewrite changes origin', async () => {
    const router = createAboutRouter({
      initialEntries: ['/docs/about?lang=en#team'],
      origin: 'https://public.example.com',
      rewrite: {
        input: ({ url }) => {
          if (url.origin === 'https://public.example.com') {
            url.pathname = url.pathname.replace(/^\/docs/, '')
            return new URL(
              `${url.pathname}${url.search}${url.hash}`,
              'https://internal.example.com',
            )
          }

          return url
        },
      },
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/about')
    expect(router.state.location.href).toBe('/about?lang=en#team')
    expect(router.state.location.publicHref).toBe('/docs/about?lang=en#team')
    expect(router.state.location.url.href).toBe(
      'https://public.example.com/docs/about?lang=en#team',
    )
    expect(router.state.location.url.origin).toBe('https://public.example.com')
  })

  test('buildLocation exposes the current origin to output rewrites', async () => {
    const router = createAboutRouter({
      initialEntries: ['/'],
      origin: 'https://internal.example.com',
      rewrite: {
        output: ({ url }) => {
          if (url.origin === 'https://internal.example.com') {
            url.pathname = `/docs${url.pathname}`
            return new URL(
              `${url.pathname}${url.search}${url.hash}`,
              'https://public.example.com',
            )
          }

          return url
        },
      },
    })

    await router.load()

    const location = router.buildLocation({
      to: '/about',
      search: { lang: 'en' },
      hash: 'team',
    })

    expect(location.href).toBe('/docs/about?lang=en#team')
    expect(location.publicHref).toBe(
      'https://public.example.com/docs/about?lang=en#team',
    )
    expect(location.external).toBe(true)
    expect(location.url.href).toBe(
      'https://public.example.com/docs/about?lang=en#team',
    )
    expect(location.url.origin).toBe('https://public.example.com')
  })

  test('buildAndCommitLocation uses origin-aware rewrites when href is provided', async () => {
    const router = createAboutRouter({
      initialEntries: ['/docs'],
      origin: 'https://public.example.com',
      rewrite: {
        input: ({ url }) => {
          if (url.origin === 'https://public.example.com') {
            url.pathname = url.pathname.replace(/^\/docs/, '') || '/'
          }

          return url
        },
        output: ({ url }) => {
          if (url.origin === 'https://public.example.com') {
            url.pathname = `/docs${url.pathname === '/' ? '' : url.pathname}`
          }

          return url
        },
      },
    })

    await router.load()
    await router.buildAndCommitLocation({ href: '/docs/about?lang=en#team' })

    expect(router.history.location.href).toBe('/docs/about?lang=en#team')
    expect(router.state.location.pathname).toBe('/about')
    expect(router.state.location.href).toBe('/about?lang=en#team')
    expect(router.state.location.publicHref).toBe('/docs/about?lang=en#team')
    expect(router.state.location.url.href).toBe(
      'https://public.example.com/docs/about?lang=en#team',
    )
  })
})
