import { notFound } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { authMiddleware } from './middleware/auth'
import { addLike, countDrafts, countPosts, findPost } from './server-only'

export const fetchPost = createServerFn()
  .validator((postId: string) => postId)
  .handler(({ data, context }) => {
    const post = findPost(data, context.locale)
    if (!post) {
      throw notFound()
    }
    return post
  })

// A middleware that is created in the file of the server function that uses
// it. A test replaces it with `mockMiddleware` like one in a file of its own
// (see tests/posts.server.test.ts).
export const draftsMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { drafts: countDrafts() } }),
)

export const fetchPostCount = createServerFn()
  .middleware([draftsMiddleware])
  .handler(({ context }) => countPosts() + context.drafts)

export const likePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((postId: string) => postId)
  .handler(({ data, context }) => {
    setResponseHeader('cache-control', 'no-store')
    return addLike(data, context.user.id)
  })
