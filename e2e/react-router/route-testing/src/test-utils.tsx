import { render } from '@testing-library/react'
import { createRouterTesting } from '@tanstack/react-router/testing'
import { routeTree } from './routeTree.gen'
import type { Post, User } from './api'

export const testUser: User = { id: 'user-1', name: 'Ada' }

export function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    title: 'Hello world',
    authorId: 'user-2',
    status: 'published',
    ...overrides,
  }
}

/**
 * Test helpers without defaults. Every test supplies the whole state its
 * route promises.
 */
export const routerTesting = createRouterTesting({ routeTree, render })

/**
 * Test helpers with the values most tests of this app share. What is given
 * here is optional in each test.
 */
export const appTesting = createRouterTesting({
  routeTree,
  render,
  defaults: {
    context: {
      locale: 'en',
      session: { user: testUser },
      user: testUser,
    },
    routes: {
      '/_authed': { loaderData: { unreadCount: 0 } },
    },
  },
})
