import { Await, createFileRoute } from '@tanstack/vue-router'
import { Suspense, defineComponent } from 'vue'
import {
  makeDeferredSectionPayload,
  type DeferredSectionPayload,
} from '../../../deferred-section-data'
import { createSectionGates } from '../../../stream-gate'

const StreamComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => {
      const deferredSections = [
        { index: 0, promise: data.value.deferred0 },
        { index: 1, promise: data.value.deferred1 },
        { index: 2, promise: data.value.deferred2 },
        { index: 3, promise: data.value.deferred3 },
      ] as const

      return (
        <main data-bench="streaming-peak-page">
          <h1>{data.value.eager}</h1>
          {deferredSections.map(({ index, promise }) => (
            <>
              <p data-bench={`streaming-peak-fallback-${index}`}>
                streaming-peak-fallback-{index}
              </p>
              <Suspense key={index}>
                {{
                  default: () => (
                    <Await
                      promise={promise}
                      children={(section: DeferredSectionPayload) => (
                        <DeferredSection section={section} />
                      )}
                    />
                  ),
                  fallback: () => null,
                }}
              </Suspense>
            </>
          ))}
        </main>
      )
    }
  },
})

export const Route = createFileRoute('/stream/$id')({
  loader: ({ params }) => {
    const gates = createSectionGates(params.id)

    return {
      eager: `streaming-peak-eager-${params.id}`,
      deferred0: makeDeferredSection(params.id, gates[0]!, 0),
      deferred1: makeDeferredSection(params.id, gates[1]!, 1),
      deferred2: makeDeferredSection(params.id, gates[2]!, 2),
      deferred3: makeDeferredSection(params.id, gates[3]!, 3),
    }
  },
  component: StreamComponent,
})

// Each section resolves when the bench opens its gate (see stream-gate.ts).
function makeDeferredSection(
  id: string,
  gate: Promise<void>,
  sectionIndex: number,
) {
  return gate.then(() => makeDeferredSectionPayload(id, sectionIndex))
}

function DeferredSection({ section }: { section: DeferredSectionPayload }) {
  const marker = `streaming-peak-deferred-${section.index}`

  return (
    <section data-bench={marker}>
      <h2>{marker}</h2>
      {section.records.map((record) => (
        <p key={record.id}>{record.value}</p>
      ))}
    </section>
  )
}
