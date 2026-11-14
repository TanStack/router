import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { UserMenu } from '../src/components/UserMenu'
import { appTesting, createPost, testUser } from '../src/test-utils'

describe('a component bound to a layout route', () => {
  test('is rendered through a child route and reads the state of the layout route', async () => {
    await appTesting.renderInRoute(<UserMenu />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      context: { user: { id: 'user-9', name: 'Grace' } },
      loaderData: { post: createPost() },
      routes: { '/_authed': { loaderData: { unreadCount: 7 } } },
    })

    const menu = screen.getByLabelText('User menu')
    expect(menu.textContent).toContain('Grace')
    expect(menu.textContent).toContain('7 unread')
  })

  test('navigating away changes the location and renders no other route', async () => {
    const { router } = await appTesting.renderInRoute(<UserMenu />, {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      loaderData: { post: createPost() },
    })

    fireEvent.click(screen.getByRole('link', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  test('cannot be rendered in a layout route that its own path does not lead to', async () => {
    await expect(
      appTesting.renderInRoute(<UserMenu />, {
        route: '/_authed',
        context: { user: testUser },
      }),
    ).rejects.toThrow('The route "/_authed" is not matched at "/"')
  })
})
