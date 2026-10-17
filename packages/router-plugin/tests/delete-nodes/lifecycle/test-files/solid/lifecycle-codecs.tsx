import { createFileRoute } from '@tanstack/solid-router'
import { getSession, sessions } from './sessions'
import { toWire } from './server-only'
import { fetchPost } from './posts'
import { parsePost } from './client-only'

export const Route = createFileRoute('/posts/$postId')({
  ssr: 'data-only',
  context: {
    handler: async ({ params, context }) => ({
      postId: params.postId,
      session: await getSession(context),
    }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => ({
      postId: data.postId,
      session: sessions.get(data.userId),
    }),
    revalidate: true,
  },
  beforeLoad: {
    handler: ({ context }) => ({ user: context.session.user }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => data,
  },
  loader: {
    handler: ({ params }) => fetchPost(params.postId),
    dehydrate: async ({ data }) => toWire(data),
    hydrate: async ({ data }) => parsePost(data),
    staleReloadMode: 'background',
  },
  component: () => <div className="p-2">hello world</div>,
})
