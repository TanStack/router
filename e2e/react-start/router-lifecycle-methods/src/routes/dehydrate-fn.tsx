import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Each lifecycle method returns a value that includes a Date (non-serializable).
// The dehydrate function converts to a plain object with ISO string.
// The hydrate function reconstructs the Date from the ISO string.
//
// We use createIsomorphicFn to produce different dates on server vs client,
// so the test can distinguish which environment produced the value.

const getContextDate = createIsomorphicFn()
  .server(() => new Date('2020-01-01T00:00:00.000Z'))
  .client(() => new Date('2099-01-01T00:00:00.000Z'))

const getBeforeLoadDate = createIsomorphicFn()
  .server(() => new Date('2020-06-15T00:00:00.000Z'))
  .client(() => new Date('2099-06-15T00:00:00.000Z'))

const getLoaderDate = createIsomorphicFn()
  .server(() => new Date('2020-12-25T00:00:00.000Z'))
  .client(() => new Date('2099-12-25T00:00:00.000Z'))

export const Route = createFileRoute('/dehydrate-fn')({
  context: {
    handler: () => ({ createdAt: getContextDate() }),
    dehydrate: ({ data }) => ({
      createdAt: data.createdAt.toISOString(),
    }),
    hydrate: ({ data }) => ({
      createdAt: new Date(data.createdAt),
    }),
  },
  beforeLoad: {
    handler: () => ({ processedAt: getBeforeLoadDate() }),
    dehydrate: ({ data }) => ({
      processedAt: data.processedAt.toISOString(),
    }),
    hydrate: ({ data }) => ({
      processedAt: new Date(data.processedAt),
    }),
  },
  loader: {
    handler: () => ({ loadedAt: getLoaderDate() }),
    dehydrate: ({ data }) => ({
      loadedAt: data.loadedAt.toISOString(),
    }),
    hydrate: ({ data }) => ({
      loadedAt: new Date(data.loadedAt),
    }),
  },
  ssr: 'data-only',
  component: DehydrateFnComponent,
})

function DehydrateFnComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  // Verify hydrate reconstructed Date objects (not strings)
  const contextIsDate = context.createdAt instanceof Date
  const beforeLoadIsDate = context.processedAt instanceof Date
  const loaderIsDate = loaderData.loadedAt instanceof Date

  return (
    <div data-testid="dfn-component">
      <h1 data-testid="dfn-heading">Dehydrate Functions</h1>
      {/* Show ISO string representation of the dates */}
      <div data-testid="dfn-context">
        {contextIsDate ? context.createdAt.toISOString() : 'NOT_A_DATE'}
      </div>
      <div data-testid="dfn-beforeLoad">
        {beforeLoadIsDate ? context.processedAt.toISOString() : 'NOT_A_DATE'}
      </div>
      <div data-testid="dfn-loader">
        {loaderIsDate ? loaderData.loadedAt.toISOString() : 'NOT_A_DATE'}
      </div>
      {/* Show whether hydrate correctly reconstructed Date instances */}
      <div data-testid="dfn-context-type">
        {contextIsDate ? 'Date' : 'other'}
      </div>
      <div data-testid="dfn-beforeLoad-type">
        {beforeLoadIsDate ? 'Date' : 'other'}
      </div>
      <div data-testid="dfn-loader-type">{loaderIsDate ? 'Date' : 'other'}</div>
    </div>
  )
}
