import { ClientOnly, createFileRoute, useRouter } from '@tanstack/react-router'
import { countClientRun, getOrigin } from '~/utils/origin'
import { getPost } from '~/utils/posts'

// Query options in context, the default case.
// Function form: not transported (context default is `dehydrate: false`), so
// the client recomputes it during hydration. It is memoized per match, so
// `router.invalidate()` does not re-run it and consumers keep identities.

function postQueryOptions(postId: string) {
  return {
    queryKey: ['post', postId] as const,
    queryFn: () => getPost(Number(postId)),
  }
}

export const Route = createFileRoute('/query-context/$postId')({
  context: ({ params }) => ({
    postQueryOptions: postQueryOptions(params.postId),
    contextOrigin: getOrigin(),
    // Identity witness: increments on every client run of this handler.
    contextInstance: countClientRun('query-context'),
  }),
  loader: ({ context }) => ({
    post: context.postQueryOptions.queryFn(),
    loaderOrigin: getOrigin(),
    loaderInstance: countClientRun('query-loader'),
  }),
  component: QueryContextComponent,
})

function QueryContextComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="query-component">
      <h1 data-testid="query-heading">Query context</h1>
      <div data-testid="query-post-title">
        {loaderData.post?.title ?? 'none'}
      </div>
      <div data-testid="query-loader-origin">{loaderData.loaderOrigin}</div>
      <div data-testid="query-loader-instance">
        {String(loaderData.loaderInstance)}
      </div>
      {/* The context is recomputed on the client, so origin-dependent fields
          are rendered client-only on this ssr: true route: a server-rendered
          component needs the same value on both sides. */}
      <ClientOnly>
        <div data-testid="query-context-origin">{context.contextOrigin}</div>
        <div data-testid="query-context-instance">
          {String(context.contextInstance)}
        </div>
        <div data-testid="query-fn-type">
          {typeof context.postQueryOptions.queryFn}
        </div>
        <div data-testid="query-key">
          {context.postQueryOptions.queryKey.join('/')}
        </div>
      </ClientOnly>
      <button
        data-testid="query-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
