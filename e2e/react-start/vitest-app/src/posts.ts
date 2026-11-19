import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { authMiddleware } from './middleware/auth'
import { addLike, countPosts, findPost } from './server-only'

export const fetchPost = createServerFn()
  .validator((postId: string) => postId)
  .handler(({ data, context }) => {
    const post = findPost(data, context.locale)
    if (!post) {
      throw notFound()
    }
    return post
  })

export const fetchPostCount = createServerFn().handler(() => countPosts())

export const likePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((postId: string) => postId)
  .handler(({ data, context }) => {
    setResponseHeader('cache-control', 'no-store')
    return addLike(data, context.user.id)
  })
