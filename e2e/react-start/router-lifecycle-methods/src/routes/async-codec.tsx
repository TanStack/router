import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Async codecs: `dehydrate` and `hydrate` may return promises; the
// server awaits `dehydrate` before the match settles and the client awaits
// `hydrate` in the hydration lane. The types unwrap the promise on both
// sides, so `hydrate` receives the awaited wire shape. Exercised on
// `context` and `loader`.

const getContextLabel = createIsomorphicFn()
  .server(() => 'server-ac-context')
  .client(() => 'client-ac-context')

const getLoaderTitle = createIsomorphicFn()
  .server(() => 'server-ac-loader')
  .client(() => 'client-ac-loader')

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5))

type ContextData = { label: string; stamp: number; via: string }
type ContextWire = { label: string; packed: string }

async function encodeContext(data: ContextData): Promise<ContextWire> {
  await tick()
  return { label: data.label, packed: `${data.stamp}` }
}

async function decodeContext(wire: ContextWire): Promise<ContextData> {
  await tick()
  return { label: wire.label, stamp: Number(wire.packed), via: 'async-hydrate' }
}

type LoaderData = { title: string; scores: Array<number>; via: string }
type LoaderWire = { title: string; csv: string }

async function encodeLoader(data: LoaderData): Promise<LoaderWire> {
  await tick()
  return { title: data.title, csv: data.scores.join(',') }
}

async function decodeLoader(wire: LoaderWire): Promise<LoaderData> {
  await tick()
  return {
    title: wire.title,
    scores: wire.csv.split(',').map(Number),
    via: 'async-hydrate',
  }
}

export const Route = createFileRoute('/async-codec')({
  ssr: 'data-only',
  context: {
    handler: (): ContextData => ({
      label: getContextLabel(),
      stamp: 7,
      via: 'handler',
    }),
    dehydrate: ({ data }) => encodeContext(data),
    hydrate: ({ data }) => decodeContext(data),
  },
  loader: {
    handler: (): LoaderData => ({
      title: getLoaderTitle(),
      scores: [10, 20, 30],
      via: 'handler',
    }),
    dehydrate: ({ data }) => encodeLoader(data),
    hydrate: ({ data }) => decodeLoader(data),
  },
  component: AsyncCodecComponent,
})

function AsyncCodecComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="ac-component">
      <h1 data-testid="ac-heading">Async codec</h1>
      <div data-testid="ac-context-label">{context.label}</div>
      <div data-testid="ac-context-stamp">{String(context.stamp)}</div>
      <div data-testid="ac-context-stamp-type">{typeof context.stamp}</div>
      <div data-testid="ac-context-via">{context.via}</div>
      <div data-testid="ac-loader-title">{loaderData.title}</div>
      <div data-testid="ac-loader-scores">{loaderData.scores.join('|')}</div>
      <div data-testid="ac-loader-scores-type">
        {Array.isArray(loaderData.scores) ? 'array' : typeof loaderData.scores}
      </div>
      <div data-testid="ac-loader-via">{loaderData.via}</div>
    </div>
  )
}
