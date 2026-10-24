import { createFileRoute } from '@tanstack/solid-router'
import { getSession, sessions } from './sessions'
import { fetchPost } from './posts'
import { parsePost } from './client-only'
export const Route = createFileRoute('/posts/$postId')({
  context: {
    handler: async ({ params, context }) => ({
      postId: params.postId,
      session: await getSession(context),
    }),
    hydrate: ({ data }) => ({
      postId: data.postId,
      session: sessions.get(data.userId),
    }),
    revalidate: true,
  },
  beforeLoad: {
    handler: ({ context }) => ({ user: context.session.user }),
    hydrate: ({ data }) => data,
  },
  loader: {
    handler: ({ params }) => fetchPost(params.postId),
    hydrate: async ({ data }) => parsePost(data),
    staleReloadMode: 'background',
  },
  component: () => <div className="p-2">hello world</div>,
})
