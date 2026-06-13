import { Await, createFileRoute } from '@tanstack/solid-router'
import { Suspense } from 'solid-js'

const deferredRecordCount = 250
const recordValueLength = 128
const fallbackFlushDelayMs = 25

interface DeferredRecord {
  id: string
  value: string
}

export interface DeferredSectionPayload {
  index: number
  records: Array<DeferredRecord>
}

export const Route = createFileRoute('/stream/$id')({
  loader: ({ params }) => ({
    eager: `streaming-peak-eager-${params.id}`,
    deferred0: makeDeferredSection(params.id, 0),
    deferred1: makeDeferredSection(params.id, 1),
    deferred2: makeDeferredSection(params.id, 2),
    deferred3: makeDeferredSection(params.id, 3),
  }),
  component: StreamComponent,
})

// Deferred sections must settle after the framework shell flush so the bench
// continues exercising multi-flush streaming with visible fallback chunks.
function afterFallbackFlush(sectionIndex: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, fallbackFlushDelayMs + sectionIndex)
  })
}

function makeRecordValue(
  id: string,
  sectionIndex: number,
  recordIndex: number,
) {
  const token = `${id}:${sectionIndex}:${recordIndex}:streaming-peak-record;`

  return token
    .repeat(Math.ceil(recordValueLength / token.length))
    .slice(0, recordValueLength)
}

function makeDeferredSection(id: string, sectionIndex: number) {
  return afterFallbackFlush(sectionIndex).then<DeferredSectionPayload>(() => ({
    index: sectionIndex,
    records: Array.from({ length: deferredRecordCount }, (_, recordIndex) => ({
      id: `${id}-${sectionIndex}-${recordIndex}`,
      value: makeRecordValue(id, sectionIndex, recordIndex),
    })),
  }))
}

function StreamComponent() {
  const data = Route.useLoaderData()
  const deferredSections = () =>
    [
      { index: 0, promise: data().deferred0 },
      { index: 1, promise: data().deferred1 },
      { index: 2, promise: data().deferred2 },
      { index: 3, promise: data().deferred3 },
    ] as const

  return (
    <main data-bench="streaming-peak-page">
      <h1>{data().eager}</h1>
      {deferredSections().map(({ index, promise }) => (
        <>
          <p data-bench={`streaming-peak-fallback-${index}`}>
            streaming-peak-fallback-{index}
          </p>
          <Suspense fallback={null}>
            <Await promise={promise}>
              {(section) => <DeferredSection section={section} />}
            </Await>
          </Suspense>
        </>
      ))}
    </main>
  )
}

function DeferredSection(props: { section: DeferredSectionPayload }) {
  const marker = () => `streaming-peak-deferred-${props.section.index}`

  return (
    <section data-bench={marker()}>
      <h2>{marker()}</h2>
      {props.section.records.map((record) => (
        <p>{record.value}</p>
      ))}
    </section>
  )
}
