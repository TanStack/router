// Server functions exposed by this Start backend. The React Native client
// examples (bare, expo-dev-client) compile their `createServerFn` call sites
// into RPC stubs that fetch these endpoints.
//
// Function IDs are deterministic (sha256 of `${relativeFilename}--${functionName}`),
// so the same source on the RN side resolves to the same id and hits these
// handlers without any manifest exchange.

import { createServerFn } from '@tanstack/react-start'
import { getPostData, listPostsData } from './utils/posts'

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
