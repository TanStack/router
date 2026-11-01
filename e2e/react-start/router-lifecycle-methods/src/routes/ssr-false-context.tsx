import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { countClientRun } from '~/utils/origin'

// `ssr: false` runs nothing on the server, `context` included (it is a
// lifecycle like the other two; earlier versions still ran it). Each lifecycle
// records where it ran with a marker only its server branch produces: the SSR
// HTML and its hydration payload must contain none of them, and the client
// runs the context exactly once at hydration (memoized per match afterwards).

const contextOrigin = createIsomorphicFn()
  .server(() => 'TSR_E2E_SFC_CONTEXT_SERVER')
  .client(() => 'sfc-context-client')

const beforeLoadOrigin = createIsomorphicFn()
  .server(() => 'TSR_E2E_SFC_BEFORELOAD_SERVER')
  .client(() => 'sfc-beforeLoad-client')

const loaderOrigin = createIsomorphicFn()
  .server(() => 'TSR_E2E_SFC_LOADER_SERVER')
  .client(() => 'sfc-loader-client')

export const Route = createFileRoute('/ssr-false-context')({
  ssr: false,
  context: {
    handler: () => ({
      sfcContextOrigin: contextOrigin(),
      sfcContextRuns: countClientRun('sfc-context'),
    }),
    // transport is asked for, but an `ssr: false` match has nothing to send
    dehydrate: true,
  },
  beforeLoad: () => ({ sfcBeforeLoadOrigin: beforeLoadOrigin() }),
  loader: () => ({ sfcLoaderOrigin: loaderOrigin() }),
  component: SsrFalseContextComponent,
})

function SsrFalseContextComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="sfc-component">
      <h1 data-testid="sfc-heading">SSR false context</h1>
      <div data-testid="sfc-context-origin">{context.sfcContextOrigin}</div>
      <div data-testid="sfc-context-runs">{String(context.sfcContextRuns)}</div>
      <div data-testid="sfc-beforeLoad-origin">
        {context.sfcBeforeLoadOrigin}
      </div>
      <div data-testid="sfc-loader-origin">{loaderData.sfcLoaderOrigin}</div>
    </div>
  )
}
