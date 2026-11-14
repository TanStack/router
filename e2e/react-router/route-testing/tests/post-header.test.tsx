import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import {
  appTesting,
  createPost,
  routerTesting,
  testUser,
} from '../src/test-utils'

describe('a component rendered in its route with supplied state', () => {
  test('reads loader data, context, search and params of the route', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await routerTesting.renderInRoute(<PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      context: { locale: 'en', session: { user: testUser }, user: testUser },
      loaderData: {
        post: createPost({ title: 'Typed tests', authorId: testUser.id }),
      },
      routes: { '/_authed': { loaderData: { unreadCount: 2 } } },
    })

    expect(screen.getByRole('heading').textContent).toBe('Typed tests')
    expect(screen.getByText('Written by you')).toBeTruthy()
    expect(screen.queryByText('Draft')).toBeNull()

    const link = screen.getByRole('link', { name: 'Show comments' })
    expect(link.getAttribute('href')).toBe('/posts/post-1?tab=comments')
  })

  test('runs no lifecycle of the application and renders none of its layout', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await routerTesting.renderInRoute(<PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      context: { locale: 'en', session: { user: testUser }, user: testUser },
      loaderData: { post: createPost() },
      routes: { '/_authed': { loaderData: { unreadCount: 2 } } },
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByLabelText('User menu')).toBeNull()
    expect(screen.queryByLabelText('Tab content')).toBeNull()
  })

  test('takes shared values from the defaults of the application', async () => {
    await appTesting.renderInRoute(<PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      loaderData: { post: createPost({ status: 'draft' }) },
    })

    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.queryByText('Written by you')).toBeNull()
  })

  test('sends search params through the validateSearch of the route', async () => {
    await appTesting.renderInRoute(<PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      search: { tab: 'comments' },
      loaderData: { post: createPost() },
    })

    expect(screen.getByRole('link', { name: 'Show details' })).toBeTruthy()
  })

  test('fails when the search params do not pass validateSearch', async () => {
    await expect(
      appTesting.renderInRoute(<PostHeader />, {
        route: '/_authed/posts/$postId',
        params: { postId: 'post-1' },
        search: { tab: 'history' },
        loaderData: { post: createPost() },
      }),
    ).rejects.toThrow('Unknown tab "history"')
  })

  test('navigates with the real router', async () => {
    const { router } = await appTesting.renderInRoute(<PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      loaderData: { post: createPost() },
    })

    fireEvent.click(screen.getByRole('link', { name: 'Show comments' }))

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ tab: 'comments' })
    })
    expect(
      await screen.findByRole('link', { name: 'Show details' }),
    ).toBeTruthy()
  })
})
