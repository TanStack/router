import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { RouterProvider } from '@tanstack/vue-router'
import { createIsolatedTestRouter } from '@tanstack/vue-router/testing'
import { describe, expect, test } from 'vitest'
import { UserMenu } from '../src/components/UserMenu'
import { routeTree } from '../src/routeTree.gen'
import { createPost, signedInContext } from '../src/test-fixtures'

describe('a component bound to a layout route', () => {
  test('is rendered through a child route and reads the state of the layout route', async () => {
    const router = await createIsolatedTestRouter({
      routeTree,
      route: '/_authed/posts/$postId',
      element: <UserMenu />,
      params: { postId: 'post-1' },
      context: { ...signedInContext, user: { id: 'user-9', name: 'Grace' } },
      loaderData: {
        '/_authed': { unreadCount: 7 },
        '/_authed/posts/$postId': { post: createPost() },
      },
    })
    render(<RouterProvider router={router} />)

    const menu = screen.getByLabelText('User menu')
    expect(menu.textContent).toContain('Grace')
    expect(menu.textContent).toContain('7 unread')
  })

  test('navigating away changes the location and renders no other route', async () => {
    const router = await createIsolatedTestRouter({
      routeTree,
      route: '/_authed/posts/$postId',
      element: <UserMenu />,
      params: { postId: 'post-1' },
      context: signedInContext,
      loaderData: {
        '/_authed': { unreadCount: 0 },
        '/_authed/posts/$postId': { post: createPost() },
      },
    })
    render(<RouterProvider router={router} />)

    await fireEvent.click(screen.getByRole('link', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  test('cannot be rendered in a layout route that its own path does not lead to', async () => {
    await expect(
      createIsolatedTestRouter({
        routeTree,
        route: '/_authed',
        element: <UserMenu />,
        context: signedInContext,
        loaderData: { '/_authed': { unreadCount: 0 } },
      }),
    ).rejects.toThrow('The route "/_authed" is not matched at "/"')
  })
})
