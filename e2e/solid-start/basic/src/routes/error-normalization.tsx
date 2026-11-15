import { Link, createFileRoute } from '@tanstack/solid-router'
import { createSignal, onSettled } from 'solid-js'

export const Route = createFileRoute('/error-normalization')({
  validateSearch: (search) => ({
    kind: search.kind === 'string' ? ('string' as const) : ('null' as const),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    throw deps.kind === 'string' ? 'loader failure' : null
  },
  errorComponent: ({ error }) => {
    const [hydrated, setHydrated] = createSignal(false)
    onSettled(() => {
      setHydrated(true)
    })

    return (
      <section
        data-testid="error-details"
        data-name={error.name}
        data-message={error.message}
        data-cause={String(error.cause)}
        data-hydrated={String(hydrated())}
      >
        <Link to="/error-normalization" search={{ kind: 'null' }}>
          Throw null
        </Link>
      </section>
    )
  },
})
