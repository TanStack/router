import { describe, it, expect, beforeEach } from 'vitest'
import { createRouter, createRootRoute, createRoute } from '../src'
import { getMatchesHtml, buildHref, outlet } from '../src'

describe('Vanilla Router', () => {
  it('should create a router', () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root</div>`
      },
    })

    const router = createRouter({
      routeTree: rootRoute,
    })

    expect(router).toBeDefined()
    expect(router.state).toBeDefined()
  })

  it('should render root component', async () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root Component</div>`
      },
    })

    const router = createRouter({
      routeTree: rootRoute,
    })

    await router.load()

    const htmlParts = getMatchesHtml(router, router.state.matches)
    expect(htmlParts.join('')).toContain('Root Component')
  })

  it('should render nested routes', async () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root ${outlet()}</div>`
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: (router) => {
        return `<div>Index</div>`
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    await router.load()

    const htmlParts = getMatchesHtml(router, router.state.matches)
    const html = htmlParts.join('')
    expect(html).toContain('Root')
    expect(html).toContain('Index')
  })

  it('should build hrefs', () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root</div>`
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([postsRoute.addChildren([postRoute])]),
    })

    const href = buildHref(router, {
      to: '/posts/$postId',
      params: { postId: '123' },
    })

    expect(href).toBe('/posts/123')
  })

  it('should use route getters', async () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root</div>`
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      loader: () => {
        return [{ id: '1', title: 'Post 1' }]
      },
      component: (router) => {
        const posts = postsRoute.getLoaderData(router)
        return `<div>Posts: ${JSON.stringify(posts)}</div>`
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
    })

    await router.navigate({ to: '/posts' })
    await router.load()

    const htmlParts = getMatchesHtml(router, router.state.matches)
    const html = htmlParts.join('')
    expect(html).toContain('Posts:')
    expect(html).toContain('Post 1')
  })

  it('should handle route params', async () => {
    const rootRoute = createRootRoute({
      component: (router) => {
        return `<div>Root</div>`
      },
    })

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts/$postId',
      component: (router) => {
        const params = postRoute.getParams(router)
        return `<div>Post ID: ${params.postId}</div>`
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([postRoute]),
    })

    await router.navigate({ to: '/posts/123' })
    await router.load()

    const htmlParts = getMatchesHtml(router, router.state.matches)
    const html = htmlParts.join('')
    expect(html).toContain('Post ID: 123')
  })
})
