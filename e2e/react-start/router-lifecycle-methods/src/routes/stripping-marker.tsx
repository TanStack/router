import { createFileRoute, useRouter } from '@tanstack/react-router'
import { digestMarker } from '~/utils/marker-digest'

// Compiler stripping. Unique string literals live only inside the bodies
// the compiler deletes per environment:
//   client build drops  context/beforeLoad/loader.dehydrate  -> *_DEHYDRATE_MARKER_*
//   server build drops  context/beforeLoad/loader.hydrate    -> *_HYDRATE_MARKER_*
//                       and context.revalidate               -> *_REVALIDATE_MARKER
// `digestMarker` comes from a module that imports `node:crypto` and is used
// only inside `dehydrate`, so the client build must not reference it.
// tests/bundle.spec.ts asserts this against the built assets.

export const Route = createFileRoute('/stripping-marker')({
  ssr: 'data-only',
  context: {
    handler: () => ({ token: 'token-from-handler', via: 'handler' as string }),
    dehydrate: ({ data }) => ({
      token: data.token,
      digest: digestMarker('TSR_E2E_DEHYDRATE_MARKER_CONTEXT'),
    }),
    hydrate: ({ data }) => ({
      token: `${data.token}:${data.digest.length}`,
      via: 'TSR_E2E_HYDRATE_MARKER_CONTEXT',
    }),
    revalidate: ({ prev }) => ({
      token: prev?.token ?? 'no-prev',
      via: 'TSR_E2E_REVALIDATE_MARKER',
    }),
  },
  beforeLoad: {
    handler: () => ({ blVia: 'handler' as string }),
    dehydrate: ({ data }) => ({
      blVia: data.blVia,
      mark: 'TSR_E2E_DEHYDRATE_MARKER_BEFORELOAD',
    }),
    hydrate: ({ data }) => ({
      blVia: `TSR_E2E_HYDRATE_MARKER_BEFORELOAD:${data.mark.length}`,
    }),
  },
  loader: {
    handler: () => ({ ldVia: 'handler' as string }),
    dehydrate: ({ data }) => ({
      ldVia: data.ldVia,
      mark: 'TSR_E2E_DEHYDRATE_MARKER_LOADER',
    }),
    hydrate: ({ data }) => ({
      ldVia: `TSR_E2E_HYDRATE_MARKER_LOADER:${data.mark.length}`,
    }),
  },
  component: StrippingMarkerComponent,
})

function StrippingMarkerComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sm-component">
      <h1 data-testid="sm-heading">Stripping marker</h1>
      <div data-testid="sm-token">{context.token}</div>
      <div data-testid="sm-via">{context.via}</div>
      <div data-testid="sm-bl-via">{context.blVia}</div>
      <div data-testid="sm-ld-via">{loaderData.ldVia}</div>
      <button
        data-testid="sm-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
