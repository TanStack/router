import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'
import { fetchPost } from '~/utils/posts'

export const Route = createFileRoute(
  '/nested-docs/$project/$version/docs/framework/$framework/$',
)({
  loader: ({ params: { _splat } }) => {
    console.debug('👀 params._splat', _splat)
    return fetchPost(_splat!)
  },
  errorComponent: PostErrorComponent,
  component: Page,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>
  },
})

function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function Page() {
  const post = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">
        Heading for ID = {post.id}
      </h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
