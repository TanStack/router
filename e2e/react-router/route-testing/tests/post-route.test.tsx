import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { describe, expect, test, vi } from 'vitest'
import { createPost, routerTesting, testUser } from '../src/test-utils'
import type { Session } from '../src/api'

function stubApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input)
    return Promise.resolve(
      url in responses
        ? new Response(JSON.stringify(responses[url]))
        : new Response('Not found', { status: 404 }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('a test router over the route tree of the application', () => {
  test('runs the lifecycle of the application by default', async () => {
    const fetchMock = stubApi({
      '/api/session': { user: testUser } satisfies Session,
      '/api/notifications/unread-count': 3,
      '/api/posts/post-1': createPost({ title: 'From the API' }),
    })

    const router = routerTesting.createTestRouter({
      location: { to: '/posts/$postId', params: { postId: 'post-1' } },
      context: { locale: 'en' },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'From the API' }),
    ).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(screen.getByLabelText('User menu').textContent).toContain('3 unread')
    expect(screen.getByLabelText('Tab content').textContent).toBe('Details')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/session',
      '/api/notifications/unread-count',
      '/api/posts/post-1',
    ])
  })

  test('follows the redirect of a real beforeLoad', async () => {
    stubApi({ '/api/session': { user: null } satisfies Session })

    const router = routerTesting.createTestRouter({
      location: {
        to: '/posts/$postId',
        params: { postId: 'post-1' },
        search: { tab: 'comments' },
      },
      context: { locale: 'en' },
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({
      redirect: '/posts/post-1?tab=comments',
    })
  })

  test('replaces only the lifecycle options a test names', async () => {
    const fetchMock = stubApi({})

    const router = routerTesting.createTestRouter({
      location: { to: '/posts/$postId', params: { postId: 'post-7' } },
      context: { locale: 'en' },
      routes: {
        // A seed: the session lookup of the root route does not run.
        __root__: { context: { session: { user: testUser } } },
        // A seed for the loader data.
        '/_authed': { loaderData: { unreadCount: 5 } },
        // A replacement, typed like the loader of the route.
        '/_authed/posts/$postId': {
          loader: ({ params }) => ({
            post: createPost({ id: params.postId, title: 'From the test' }),
          }),
        },
      },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'From the test' }),
    ).toBeTruthy()
    // The beforeLoad of `/_authed` is not named, so the real one derived the
    // user from the seeded session.
    const menu = screen.getByLabelText('User menu')
    expect(menu.textContent).toContain(testUser.name)
    expect(menu.textContent).toContain('5 unread')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('replaces what a route renders', async () => {
    stubApi({
      '/api/session': { user: testUser } satisfies Session,
      '/api/notifications/unread-count': 0,
    })

    const router = routerTesting.createTestRouter({
      location: { to: '/posts/$postId', params: { postId: 'post-1' } },
      context: { locale: 'en' },
      routes: {
        '/_authed/posts/$postId': {
          loaderData: { post: createPost() },
          component: () => <p>Replaced page</p>,
        },
      },
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Replaced page')).toBeTruthy()
    expect(screen.queryByLabelText('Tab content')).toBeNull()
  })

  test('keeps overrides out of the next router', async () => {
    const first = routerTesting.createTestRouter({
      location: { to: '/posts/$postId', params: { postId: 'post-1' } },
      context: { locale: 'en' },
      routes: {
        __root__: { context: { session: { user: testUser } } },
        '/_authed': { loaderData: { unreadCount: 0 } },
        '/_authed/posts/$postId': { loaderData: { post: createPost() } },
      },
    })
    await first.load()
    expect(first.state.matches.at(-1)?.status).toBe('success')

    const fetchMock = stubApi({ '/api/session': { user: null } })
    const second = routerTesting.createTestRouter({
      location: { to: '/posts/$postId', params: { postId: 'post-1' } },
      context: { locale: 'en' },
    })
    await second.load()

    await waitFor(() => {
      expect(second.state.location.pathname).toBe('/login')
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/session')
  })
})
