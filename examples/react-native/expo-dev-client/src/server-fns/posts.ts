// Server functions consumed by the React Native client. The Metro
// transformer (`@tanstack/react-start/plugin/metro`) rewrites every
// `createServerFn(...).handler(...)` call site into an RPC stub that
// fetches `<serverFnBase>/_serverFn/<sha256-id>` at runtime.
//
// The matching server-side handler lives at
// `examples/react-native/_start-server/src/server-fns.ts`. Function ids
// are deterministic from (relative file path, function name), so the RN
// client and the Vite Start server agree on routing without any manifest
// exchange — provided both projects are built with the same source layout
// rooted at the workspace root.

import { createServerFn } from '@tanstack/react-start'

export type Post = {
  id: string
  title: string
  body: string
  author: string
  createdAt: string
}

export const listPosts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<Post>> => {
    // Body discarded by the Metro compiler — replaced with createClientRpc
    // pointing at the deployed Start server. This implementation only
    // matters when the same source is built into the server.
    throw new Error('listPosts handler should not run on the RN client')
  },
)

export const getPost = createServerFn({ method: 'GET' })
  .inputValidator((id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid post id')
    }
    return id
  })
  .handler(async (): Promise<Post> => {
    throw new Error('getPost handler should not run on the RN client')
  })
