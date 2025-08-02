import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

const retryMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const res = await next({ sendContext: { count: 0 } })
    // @ts-expect-error: private property
    const count = res.result
    return await next({ sendContext: { count } })
  })
  .server(async ({ next, context: { count } }) => {
    const res = await next({ context: { count } })
    // @ts-expect-error: private property
    const nextCount = res.result
    return await next({ context: { count: nextCount } })
  })

const serverFn = createServerFn()
  .middleware([retryMiddleware])
  .handler(({ context: { count } }) => {
    return count + 1
  })

export const Route = createFileRoute('/middleware/retry-next')({
  component: RouteComponent,
  loader: async () => ({ serverFnLoaderResult: await serverFn() }),
})

function RouteComponent() {
  const { serverFnLoaderResult } = Route.useLoaderData()
  return (
    <div className="p-2 m-2 grid gap-2" data-testid="retry-next-component">
      <h3>Server Function Middleware Retry Test</h3>
      <p>
        This component tests that server function middleware can call next()
        multiple times for retry logic.
      </p>
      <div data-testid="retry-success-result">
        <pre>called {serverFnLoaderResult} times</pre>
      </div>
    </div>
  )
}
