import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

const leafMiddleware = createMiddleware({ type: 'function' }).server(
  ({ data, next, result }: any) => {
    if (data?.scenario === 'known-leaf') {
      return result({
        data: {
          tag: 'leaf',
          branch: 'known',
        },
      })
    }

    return next({
      sendContext: { leaf: true },
    })
  },
)

const nestedParentMiddleware = createMiddleware({ type: 'function' })
  .middleware([leafMiddleware])
  .server(({ data, next, result }: any) => {
    if (data?.scenario === 'known-parent') {
      return result({
        data: {
          tag: 'nested-parent',
          branch: 'known',
        },
      })
    }

    return next({
      sendContext: { nestedParent: true },
    })
  })

const siblingMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    return next({
      sendContext: { sibling: true },
    })
  },
)

const groupedMiddleware = createMiddleware({ type: 'function' })
  .middleware([nestedParentMiddleware, siblingMiddleware])
  .server(({ data, next, result }: any) => {
    if (data?.scenario === 'known-root') {
      return result({
        data: {
          tag: 'group-root',
          branch: 'known',
        },
      })
    }

    return next({
      sendContext: { groupRoot: true },
    })
  })

const trailingMiddleware = createMiddleware({ type: 'function' }).server(
  ({ data, next, result }: any) => {
    if (data?.scenario === 'known-trailing') {
      return result({
        data: {
          tag: 'trailing-known',
          branch: 'known',
        },
      })
    }

    if (data?.scenario === 'unknown-trailing') {
      return result({
        data: {
          tag: 'trailing-unknown',
          branch: 'unknown',
        },
      })
    }

    return next({
      sendContext: { trailing: true },
    })
  },
)

const clientKnownMiddleware = createMiddleware({ type: 'function' })
  .middleware([groupedMiddleware, trailingMiddleware])
  .client((async ({ data, next }: any) => {
    const result = await next()

    return {
      scenario: data.scenario,
      source: result.source,
      payload: result.data,
      context: result.context,
    }
  }) as any)

const clientUnknownMiddleware = createMiddleware({ type: 'function' })
  .middleware([groupedMiddleware])
  .client((async ({ data, next }: any) => {
    const result = await next()

    return {
      scenario: data.scenario,
      source: result.source,
      payload: result.data,
      context: result.context,
    }
  }) as any)

const knownFn = createServerFn()
  .middleware([clientKnownMiddleware])
  .inputValidator((input: any) => input)
  .handler(({ data, context }: any) => {
    return {
      tag: 'handler-known',
      branch: 'known',
      scenario: data.scenario,
      context,
    }
  })

const unknownFn = createServerFn()
  .middleware([clientUnknownMiddleware, trailingMiddleware])
  .inputValidator((input: any) => input)
  .handler(({ data, context }: any) => {
    return {
      tag: 'handler-unknown',
      branch: 'unknown',
      scenario: data.scenario,
      context,
    }
  })

export const Route = createFileRoute(
  '/middleware/client-source-classification' as any,
)({
  loader: async () => {
    const loaderResults = {
      knownLeaf: await knownFn({ data: { scenario: 'known-leaf' } }),
      knownParent: await knownFn({ data: { scenario: 'known-parent' } }),
      knownRoot: await knownFn({ data: { scenario: 'known-root' } }),
      knownTrailing: await knownFn({ data: { scenario: 'known-trailing' } }),
      knownHandler: await knownFn({ data: { scenario: 'known-handler' } }),
      unknownTrailing: await unknownFn({
        data: { scenario: 'unknown-trailing' },
      }),
      unknownHandler: await unknownFn({
        data: { scenario: 'unknown-handler' },
      }),
    }

    return loaderResults
  },
  component: RouteComponent,
})

function RouteComponent() {
  const loaderResults = Route.useLoaderData()

  const cases = [
    ['known-leaf', 'loader-known-leaf'],
    ['known-parent', 'loader-known-parent'],
    ['known-root', 'loader-known-root'],
    ['known-trailing', 'loader-known-trailing'],
    ['known-handler', 'loader-known-handler'],
    ['unknown-trailing', 'loader-unknown-trailing'],
    ['unknown-handler', 'loader-unknown-handler'],
  ] as const

  return (
    <div
      className="p-4 space-y-4"
      data-testid="client-source-classification-route"
    >
      <h2 className="font-bold text-lg">
        Client Middleware Source Classification
      </h2>
      <p>
        Verifies `result.source` inside client middleware across deep and wide
        composed server middleware chains during SSR and client-side loader
        navigation.
      </p>

      {cases.map(([scenario, loaderKey]) => (
        <div key={scenario} className="border rounded p-3 space-y-2">
          <div className="font-semibold">{scenario}</div>
          <pre data-testid={loaderKey} className="text-xs overflow-auto">
            {JSON.stringify(
              loaderResults[
                scenario.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
              ],
              null,
              2,
            )}
          </pre>
        </div>
      ))}
    </div>
  )
}
