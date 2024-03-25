import * as React from 'react'
import {
  ErrorComponent,
  ErrorComponentProps,
  Link,
  useRouter,
  createFileRoute,
} from '@tanstack/react-router'
import { PostNotFoundError } from '../posts'
import { postQueryOptions } from '../postQueryOptions'
import {
  useSuspenseQuery,
  useQueryErrorResetBoundary,
} from '@tanstack/react-query'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context: { queryClient }, params: { postId } }) => {
    return queryClient.ensureQueryData(postQueryOptions(postId))
  },
  errorComponent: PostErrorComponent,
  component: PostComponent,
})

export function PostErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  React.useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  return (
    <div>
      <button
        onClick={() => {
          reset()
          router.invalidate()
        }}
      >
        retry
      </button>
      <ErrorComponent error={error} />
    </div>
  )
}

function PostComponent() {
  const postId = Route.useParams().postId
  const { data: post } = useSuspenseQuery(postQueryOptions(postId))

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: post.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  )
}
