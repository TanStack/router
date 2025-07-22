import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

let count = 0

const retryMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    await next()
    return await next()
  })
  .server(async ({ next }) => {
    await next()
    return await next()
  })

const serverFn = createServerFn()
  .middleware([retryMiddleware])
  .handler(() => {
    // Reset count when called a second time
    if (count == 4) {
      count = 0
    }
    return `called ${++count} times`
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
        <pre>{serverFnLoaderResult}</pre>
      </div>
    </div>
  )
}
