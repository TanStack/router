import { createFileRoute } from '@tanstack/react-router'

// A throw inside `dehydrate` is handled like a throw inside the handler.
// The match becomes an error match on the server, the route's errorComponent
// is part of the SSR HTML and the response carries the error status.

export const Route = createFileRoute('/codec-error-dehydrate-throws')({
  loader: {
    handler: () => ({ value: 'loader-value' }),
    dehydrate: ({ data }) => {
      if (data.value) throw new Error('TSR_E2E_DEHYDRATE_THROW')
      return { value: data.value }
    },
    hydrate: ({ data }) => ({ value: data.value }),
  },
  component: () => (
    <div data-testid="cedt-component">
      <h1 data-testid="cedt-heading">dehydrate throws</h1>
      <div data-testid="cedt-value">{Route.useLoaderData().value}</div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div data-testid="cedt-error-component">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
})
