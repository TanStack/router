import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { createIsolatedTestRouter } from '@tanstack/react-router/testing'
import { describe, expect, test, vi } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import { routeTree } from '../src/routeTree.gen'
import { createPost, signedInContext, testUser } from '../src/test-fixtures'

const postRoute = {
  routeTree,
  route: '/_authed/posts/$postId',
  element: <PostHeader />,
  params: { postId: 'post-1' },
  context: signedInContext,
} as const

describe('a component rendered in its route with supplied state', () => {
  test('reads loader data, context, search and params of the route', async () => {
    const router = await createIsolatedTestRouter({
      ...postRoute,
      loaderData: {
        '/_authed': { unreadCount: 2 },
        '/_authed/posts/$postId': {
          post: createPost({ title: 'Typed tests', authorId: testUser.id }),
        },
      },
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading').textContent).toBe('Typed tests')
    expect(screen.getByText('Written by you')).toBeTruthy()
    expect(screen.queryByText('Draft')).toBeNull()

    const link = screen.getByRole('link', { name: 'Show comments' })
    expect(link.getAttribute('href')).toBe('/posts/post-1?tab=comments')
  })

  test('runs no lifecycle of the application and renders none of its layout', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const router = await createIsolatedTestRouter({
      ...postRoute,
      loaderData: {
        '/_authed': { unreadCount: 2 },
        '/_authed/posts/$postId': { post: createPost() },
      },
    })
    render(<RouterProvider router={router} />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByLabelText('User menu')).toBeNull()
    expect(screen.queryByLabelText('Tab content')).toBeNull()
  })

  test('shows the state the test supplies', async () => {
    const router = await createIsolatedTestRouter({
      ...postRoute,
      context: { ...signedInContext, user: { id: 'user-2', name: 'Grace' } },
      loaderData: {
        '/_authed': { unreadCount: 0 },
        '/_authed/posts/$postId': { post: createPost({ status: 'draft' }) },
      },
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Written by you')).toBeTruthy()
  })

  test('sends search params through the validateSearch of the route', async () => {
    const router = await createIsolatedTestRouter({
      ...postRoute,
      search: { tab: 'comments' },
      loaderData: {
        '/_authed': { unreadCount: 0 },
        '/_authed/posts/$postId': { post: createPost() },
      },
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('link', { name: 'Show details' })).toBeTruthy()
  })

  test('fails when the search params do not pass validateSearch', async () => {
    await expect(
      createIsolatedTestRouter({
        ...postRoute,
        search: { tab: 'history' },
        loaderData: {
          '/_authed': { unreadCount: 0 },
          '/_authed/posts/$postId': { post: createPost() },
        },
      }),
    ).rejects.toThrow('Unknown tab "history"')
  })

  test('navigates with the real router', async () => {
    const router = await createIsolatedTestRouter({
      ...postRoute,
      loaderData: {
        '/_authed': { unreadCount: 0 },
        '/_authed/posts/$postId': { post: createPost() },
      },
    })
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show comments' }))

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ tab: 'comments' })
    })
    expect(
      await screen.findByRole('link', { name: 'Show details' }),
    ).toBeTruthy()
  })
})
