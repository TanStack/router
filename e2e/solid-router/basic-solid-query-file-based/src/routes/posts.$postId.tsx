import {
  ErrorComponent,
  createFileRoute,
  useRouter,
} from '@tanstack/solid-router'
import { createQuery } from '@tanstack/solid-query'
import { PostNotFoundError } from '../posts'
import { postQueryOptions } from '../postQueryOptions'
import type { ErrorComponentProps } from '@tanstack/solid-router'
import { createEffect } from 'solid-js'
import { queryClient } from '../main'

export function PostErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  createEffect(() => {
    reset()
    queryClient.resetQueries()
  })

  return (
    <div>
      <button
        onClick={() => {
          router.invalidate()
        }}
      >
        retry
      </button>
      <ErrorComponent error={error} />
    </div>
  )
}

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context: { queryClient }, params: { postId } }) => {
    return queryClient.ensureQueryData(postQueryOptions(postId))
  },
  errorComponent: PostErrorComponent,
  component: PostComponent,
})

function PostComponent() {
  const params = Route.useParams()
  const { data: post } = createQuery(() => postQueryOptions(params().postId))

  return (
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{post!.title}</h4>
      <div class="text-sm">{post!.body}</div>
    </div>
  )
}
