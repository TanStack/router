import { createFileRoute } from '@tanstack/solid-router'
import { getSession } from './sessions'
import { toWire } from './server-only'
import { fetchPost } from './posts'
export const Route = createFileRoute('/posts/$postId')({
  ssr: 'data-only',
  context: {
    handler: async ({ params, context }) => ({
      postId: params.postId,
      session: await getSession(context),
    }),
    dehydrate: ({ data }) => toWire(data),
  },
  beforeLoad: {
    handler: ({ context }) => ({ user: context.session.user }),
    dehydrate: ({ data }) => toWire(data),
  },
  loader: {
    handler: ({ params }) => fetchPost(params.postId),
    dehydrate: async ({ data }) => toWire(data),
    staleReloadMode: 'background',
  },
  component: () => <div className="p-2">hello world</div>,
})
