import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { sortJson } from '~/utils/sortJson'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const globalStartContext = getGlobalStartContext()
    return {
      serverContext: context,
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
      <h1 className="font-bold text-lg">Start context bridge</h1>

      <div>
        <div className="font-semibold">
          Bridged context (router.options.context)
        </div>
        <pre
          data-testid="bridged-context"
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
        <div className="font-semibold">Router context (from beforeLoad)</div>
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
        <Link data-testid="to-next" to="/next" className="underline">
          Go to /next
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
