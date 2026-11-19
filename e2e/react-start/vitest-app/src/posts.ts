import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { addLike, findPost } from './server-only'

export const fetchPost = createServerFn()
  .validator((postId: string) => postId)
  .handler(({ data }) => {
    const post = findPost(data)
    if (!post) {
      throw notFound()
    }
    return post
  })

export const likePost = createServerFn({ method: 'POST' })
  .validator((postId: string) => postId)
  .handler(({ data }) => addLike(data))
