import { Await, createFileRoute } from '@tanstack/solid-router'
import { Show, Suspense } from 'solid-js'
import { RenderData, makeData } from '~/data'

export const Route = createFileRoute('/ssr/stream')({
  validateSearch: (search): { gatePort?: number; secondGatePort?: number } => ({
    gatePort: typeof search.gatePort === 'number' ? search.gatePort : undefined,
    secondGatePort:
      typeof search.secondGatePort === 'number'
        ? search.secondGatePort
        : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    const wait = (port?: number) =>
      port
        ? fetch(`http://127.0.0.1:${port}`).then((response) => response.text())
        : new Promise<void>((resolve) => setTimeout(resolve, 1000))
    const dataPromise = wait(deps.gatePort).then(() => makeData())
    return {
      someString: 'hello world',
      dataPromise,
      // Reuse the same objects to exercise Solid's cross-chunk references.
      secondPromise: deps.secondGatePort
        ? wait(deps.secondGatePort).then(() => dataPromise)
        : undefined,
    }
  },

  errorComponent: (e) => <div>{e.error.message} </div>,
  component: RouteComponent,
})

function RouteComponent() {
  const loaderData = Route.useLoaderData()
  return (
    <div>
      <h3 data-testid="stream-heading">Stream</h3>
      <div data-testid="some-data">{loaderData().someString}</div>
      <Suspense fallback={<div>Loading...</div>}>
        <Await promise={loaderData().dataPromise}>
          {(data) => <RenderData id="stream" data={data} />}
        </Await>
      </Suspense>
      <Show when={loaderData().secondPromise}>
        {(promise) => (
          <Suspense fallback={<div>Waiting for the second stream...</div>}>
            <Await promise={promise()}>
              {(data) => <RenderData id="stream-second" data={data} />}
            </Await>
          </Suspense>
        )}
      </Show>
    </div>
  )
}
