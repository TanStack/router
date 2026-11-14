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

/** The context of the routes under `/_authed` for a signed-in test user. */
export const signedInContext = {
  locale: 'en',
  session: { user: testUser },
  user: testUser,
}
