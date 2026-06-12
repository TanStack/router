// Server functions exposed by this Start backend. The React Native client
// examples compile matching `src/server-fns/posts.ts` files into RPC stubs
// with the same production function IDs.

import { createServerFn } from '@tanstack/react-start'
import { getPostData, listPostsData } from '../utils/posts'

export const listPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return listPostsData()
})

export const getPost = createServerFn({ method: 'GET' })
  .inputValidator((id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid post id')
    }
    return id
  })
  .handler(async ({ data }) => {
    const post = getPostData(data)
    if (!post) {
      throw new Error(`Post ${data} not found`)
    }
    return post
  })
