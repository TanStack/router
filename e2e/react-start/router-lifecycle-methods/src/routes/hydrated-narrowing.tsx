import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { countClientRun } from '~/utils/origin'

// Combine server data with client-only data and narrow on a discriminant.
//
// `hydrate` returns a different shape than the handler, so the loader data is
// the union of both. The discriminant says which function produced the value
// and is a literal written on both sides (`as const`): the handler returns
// `hydrated: false`, `hydrate` returns `hydrated: true` plus the client-only
// `prefs`. It cannot be server versus client: the handler also runs in the
// browser on client navigations, and a runtime `env` would make the hydrate
// shape a structural subtype, which the types reduce to the handler data
// (`prefs` would be invisible). After a client navigation the component sees
// the `hydrated: false` branch, which is truthful: nothing went through
// `hydrate`.

type Prefs = { theme: string }

// Runs only inside `hydrate`, which the server build deletes.
function readPrefs(): Prefs {
  return { theme: window.localStorage.getItem('tsr-e2e-theme') ?? 'light' }
}

const fetchStats = createIsomorphicFn()
  .server(() => ({ visits: 42, origin: 'server' }))
  .client(() => ({
    visits: 42 + countClientRun('narrowing-stats'),
    origin: 'client',
  }))

export const Route = createFileRoute('/hydrated-narrowing')({
  // The hydrated value differs from the server value (prefs), so the
  // component must not be server-rendered: a server-rendered component needs
  // the same value on both sides.
  ssr: 'data-only',
  loader: {
    handler: () => ({ hydrated: false as const, stats: fetchStats() }),
    dehydrate: ({ data }) => ({ stats: data.stats }),
    hydrate: ({ data }) => ({
      hydrated: true as const,
      stats: data.stats,
      prefs: readPrefs(),
    }),
  },
  component: HydratedNarrowingComponent,
})

function HydratedNarrowingComponent() {
  const data = Route.useLoaderData()

  return (
    <div data-testid="narrowing-component">
      <h1 data-testid="narrowing-heading">Hydrated narrowing</h1>
      <div data-testid="narrowing-hydrated">{String(data.hydrated)}</div>
      <div data-testid="narrowing-stats-origin">{data.stats.origin}</div>
      <div data-testid="narrowing-stats-visits">
        {String(data.stats.visits)}
      </div>
      {data.hydrated ? (
        // narrowed: `prefs` exists only on the hydrated branch
        <div data-testid="narrowing-prefs">{data.prefs.theme}</div>
      ) : (
        <div data-testid="narrowing-prefs">no-prefs</div>
      )}
    </div>
  )
}
