import { ErrorComponent, createFileRoute } from '@tanstack/solid-router'
import type { ErrorComponentProps } from '@tanstack/solid-router'

import { NotFound } from '~/components/NotFound.js'
import { fetchPost } from '~/utils/posts.js'

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

export const Route = createFileRoute('/_authed/posts/$postId')({
  loader: ({ params: { postId } }) => fetchPost({ data: postId }),
  errorComponent: PostErrorComponent,
  component: PostComponent,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>
  },
})

function PostComponent() {
  const post = Route.useLoaderData()

  return (
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{post().title}</h4>
      <div class="text-sm">{post().body}</div>
    </div>
  )
}
