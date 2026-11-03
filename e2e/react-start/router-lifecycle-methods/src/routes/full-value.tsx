import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Reconstruct from the full value. Default transport (`dehydrate: true`,
// required next to `hydrate`) plus a client-side step that fills a field the
// server cannot know. The client-only field is declared in the handler's
// return type (`undefined` on the server) and is itself serializable: the
// handler result is what the serializability check sees, and the `hydrate`
// result, assignable to the handler data, reduces to it, so the loader data
// stays `{ report; timeZone: string | undefined }`.
// On a client navigation the handler runs in the browser and leaves
// `timeZone` undefined; only `hydrate` fills it.

const getReportSource = createIsomorphicFn()
  .server(() => 'server-full-value-report')
  .client(() => 'client-full-value-report')

async function fetchReport() {
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
  return { title: 'Quarterly report', source: getReportSource() }
}

const resolvedTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const Route = createFileRoute('/full-value')({
  // The hydrated value differs from the server value (timeZone), so the
  // component must not be server-rendered: a server-rendered component needs
  // the same value on both sides.
  ssr: 'data-only',
  loader: {
    handler: async () => ({
      report: await fetchReport(),
      timeZone: undefined as string | undefined, // filled on the client
    }),
    dehydrate: true,
    hydrate: ({ data }) => ({ ...data, timeZone: resolvedTimeZone() }),
  },
  component: FullValueComponent,
})

function FullValueComponent() {
  const data = Route.useLoaderData()

  return (
    <div data-testid="full-value-component">
      <h1 data-testid="full-value-heading">Full value</h1>
      <div data-testid="full-value-report-title">{data.report.title}</div>
      <div data-testid="full-value-report-source">{data.report.source}</div>
      <div data-testid="full-value-time-zone">{String(data.timeZone)}</div>
      <div data-testid="full-value-time-zone-type">{typeof data.timeZone}</div>
    </div>
  )
}
