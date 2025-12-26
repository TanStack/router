import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import React from 'react'

const metadataMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next, serverFnMeta }) => {
    return next({
      sendContext: {
        clientCapturedMeta: serverFnMeta,
      },
    })
  })
  .server(async ({ next, serverFnMeta, context }) => {
    return next({
      context: {
        serverCapturedMeta: serverFnMeta,
        clientCapturedMeta: context.clientCapturedMeta,
      },
    })
  })

// Server function that returns both client and server captured metadata
const getMetadataFn = createServerFn()
  .middleware([metadataMiddleware])
  .handler(async ({ context }) => {
    return {
      // Full metadata captured by server middleware
      serverMeta: context.serverCapturedMeta,
      // Metadata captured by client middleware and sent via sendContext
      // Client middleware only has { id }, not { name, filename }
      clientCapturedMeta: context.clientCapturedMeta,
    }
  })

export const Route = createFileRoute('/middleware/function-metadata')({
  loader: () => getMetadataFn(),
  component: RouteComponent,
})

function RouteComponent() {
  const loaderData = Route.useLoaderData()

  const [clientData, setClientData] = React.useState<typeof loaderData | null>(
    null,
  )

  return (
    <div>
      <h2>Function Metadata in Middleware</h2>
      <p>
        This test verifies that both client and server middleware receive
        serverFnMeta in their options. Client middleware gets only the id, while
        server middleware gets the full metadata (id, name, filename).
      </p>
      <br />
      <div>
        <div data-testid="loader-data">
          <h3>Loader Data (SSR)</h3>
          <h4>Server Captured Metadata:</h4>
          <div>
            Function ID:{' '}
            <span data-testid="loader-function-id">
              {loaderData.serverMeta?.id}
            </span>
          </div>
          <div>
            Function Name:{' '}
            <span data-testid="loader-function-name">
              {loaderData.serverMeta?.name}
            </span>
          </div>
          <div>
            Filename:{' '}
            <span data-testid="loader-filename">
              {loaderData.serverMeta?.filename}
            </span>
          </div>
          <h4>Client Captured Metadata (via sendContext):</h4>
          <p>Client middleware only receives id, not name or filename:</p>
          <div>
            Client Captured ID:{' '}
            <span data-testid="loader-client-captured-id">
              {loaderData.clientCapturedMeta?.id}
            </span>
          </div>
          <div>
            Client Captured Name:{' '}
            <span data-testid="loader-client-captured-name">
              {/* Cast to any to test that name is not present at runtime */}
              {(loaderData.clientCapturedMeta as any)?.name ?? 'undefined'}
            </span>
          </div>
          <div>
            Client Captured Filename:{' '}
            <span data-testid="loader-client-captured-filename">
              {/* Cast to any to test that filename is not present at runtime */}
              {(loaderData.clientCapturedMeta as any)?.filename ?? 'undefined'}
            </span>
          </div>
        </div>
        <br />
        <div>
          <button
            data-testid="call-server-fn-btn"
            onClick={async () => {
              const data = await getMetadataFn()
              setClientData(data)
            }}
          >
            Call server function from client
          </button>
        </div>
        <br />
        {clientData && (
          <div data-testid="client-data">
            <h3>Client Data</h3>
            <h4>Server Captured Metadata:</h4>
            <div>
              Function ID:{' '}
              <span data-testid="client-function-id">
                {clientData.serverMeta?.id}
              </span>
            </div>
            <div>
              Function Name:{' '}
              <span data-testid="client-function-name">
                {clientData.serverMeta?.name}
              </span>
            </div>
            <div>
              Filename:{' '}
              <span data-testid="client-filename">
                {clientData.serverMeta?.filename}
              </span>
            </div>
            <h4>Client Captured Metadata (via sendContext):</h4>
            <p>Client middleware only receives id, not name or filename:</p>
            <div>
              Client Captured ID:{' '}
              <span data-testid="client-client-captured-id">
                {clientData.clientCapturedMeta?.id}
              </span>
            </div>
            <div>
              Client Captured Name:{' '}
              <span data-testid="client-client-captured-name">
                {/* Cast to any to test that name is not present at runtime */}
                {(clientData.clientCapturedMeta as any)?.name ?? 'undefined'}
              </span>
            </div>
            <div>
              Client Captured Filename:{' '}
              <span data-testid="client-client-captured-filename">
                {/* Cast to any to test that filename is not present at runtime */}
                {(clientData.clientCapturedMeta as any)?.filename ??
                  'undefined'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
