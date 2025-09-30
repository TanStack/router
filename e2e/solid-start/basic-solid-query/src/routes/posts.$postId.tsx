import { useQuery } from '@tanstack/solid-query'
import { ErrorComponent, createFileRoute } from '@tanstack/solid-router'
import { postQueryOptions } from '~/utils/posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
  errorComponent: PostErrorComponent,
  component: PostComponent,
})

export function PostErrorComponent({ error }: { error: any }) {
  return <ErrorComponent error={error} />
}

function PostComponent() {
  const params = Route.useParams()
  const postQuery = useQuery(() => postQueryOptions(params().postId))

  return (
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{postQuery.data?.title}</h4>
      <div class="text-sm">{postQuery.data?.body}</div>
    </div>
  )
}