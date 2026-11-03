import { createFileRoute, redirect } from '@tanstack/react-router'

// Codecs are transforms, not lifecycles. A `redirect()` thrown from
// `dehydrate` is not control flow; it is treated as an ordinary error, so the
// response is an error page at the same URL, never a redirect.

export const Route = createFileRoute('/codec-error-dehydrate-redirect')({
  loader: {
    handler: () => ({ value: 'loader-value' }),
    dehydrate: ({ data }) => {
      if (data.value) throw redirect({ to: '/' })
      return { value: data.value }
    },
    hydrate: ({ data }) => ({ value: data.value }),
  },
  component: () => (
    <div data-testid="cedr-component">
      <h1 data-testid="cedr-heading">redirect from dehydrate</h1>
      <div data-testid="cedr-value">{Route.useLoaderData().value}</div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div data-testid="cedr-error-component">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
})
