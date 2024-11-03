import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'
import { getDocument } from '~/server/document'
import { capitalize, seo } from '~/utils/seo'

export const Route = createFileRoute(
  '/$project/$version/docs/framework/$framework/$',
)({
  loader: ({ params: { _splat } }) => getDocument(_splat!),
  meta: ({ loaderData, params }) =>
    seo({
      title: `${loaderData.title} | TanStack ${capitalize(params.project)} ${capitalize(params.framework)}`,
    }),
  errorComponent: PostErrorComponent,
  component: Page,
  notFoundComponent: () => {
    return <NotFound>Document not found</NotFound>
  },
})

function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function Page() {
  const post = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4
        data-testid="selected-doc-heading"
        className="text-xl font-bold underline"
      >
        {post.title}
      </h4>
      <div className="text-sm">{post.content}</div>
    </div>
  )
}
