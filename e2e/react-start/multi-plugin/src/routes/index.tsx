import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { sortJson } from '~/utils/sortJson'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const globalStartContext = getGlobalStartContext()
    // Extract only serializable keys from context (exclude queryClient)
    const { queryClient: _qc, ...serializableContext } = context
    return {
      serverContext: serializableContext,
      globalStartContext,
    }
  },
  component: Home,
})

function Home() {
  const router = useRouter()
  const { serverContext, globalStartContext } = Route.useRouteContext()
  const routerCtx = router.options.context

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-bold text-lg">Multi-Plugin Test</h1>

      <div>
        <div className="font-semibold">
          Router context (router.options.context)
        </div>
        <pre
          data-testid="router-context"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(
            {
              context: sortJson(routerCtx),
            },
            null,
            2,
          )}
        </pre>
      </div>

      <div>
        <div className="font-semibold">Server context (from beforeLoad)</div>
        <pre
          data-testid="server-context"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(sortJson(serverContext), null, 2)}
        </pre>
      </div>

      <div>
        <div className="font-semibold">Global start context</div>
        <pre
          data-testid="global-start-context"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(sortJson(globalStartContext), null, 2)}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <Link
          data-testid="to-query-test"
          to="/query-test"
          className="underline"
        >
          Go to /query-test
        </Link>
        <button
          type="button"
          className="px-2 py-1 border rounded"
          data-testid="invalidate"
          onClick={() => router.invalidate()}
        >
          Invalidate
        </button>
      </div>
    </div>
  )
}
