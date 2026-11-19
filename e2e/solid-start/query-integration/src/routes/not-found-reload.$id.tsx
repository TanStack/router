import { createFileRoute, notFound } from '@tanstack/solid-router'
import { For } from 'solid-js'

// Repro: `defaultNotFoundComponent` used to be applied by lazily mutating
// `route.options.notFoundComponent` when a notFound was handled. Route objects
// are module singletons shared across server requests, so after the server
// handled a single 404 for this route, every later SSR of a *valid* URL
// wrapped the match in a CatchNotFound boundary the freshly-hydrating client
// doesn't have — shifting every _hk under the match and leaving the subtree
// unclaimed (visible but inert SSR DOM).
const ITEMS = ['one', 'two', 'three']

export const Route = createFileRoute('/not-found-reload/$id')({
  loader: ({ params }) => {
    if (params.id === 'missing') throw notFound()
    return { id: params.id }
  },
  head: ({ params }) => ({
    meta: [{ title: `not-found-reload ${params.id}` }],
  }),
  component: NotFoundReloadComponent,
})

function NotFoundReloadComponent() {
  const params = Route.useParams()

  return (
    <div class="p-2">
      <h3 data-testid="not-found-reload-heading">id: {params().id}</h3>
      <ul data-testid="not-found-reload-list">
        <For each={ITEMS}>{(item) => <li>{item}</li>}</For>
      </ul>
      {/* Interactivity probe: if hydration failed to claim the SSR DOM
          (hydration-id desync), no event handler is bound to this button
          and clicking it does nothing. */}
      <button
        type="button"
        data-testid="not-found-reload-button"
        onClick={(e) => e.currentTarget.setAttribute('data-clicked', 'true')}
      >
        click me
      </button>
    </div>
  )
}
