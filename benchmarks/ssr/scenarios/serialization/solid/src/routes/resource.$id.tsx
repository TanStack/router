import { Await, createFileRoute } from '@tanstack/solid-router'
import { Show, Suspense } from 'solid-js'
import { makeRichSerializationData } from '../../../shared-data'
import { makeBigPayload, sleep0 } from '../../../../streaming/shared-data'

export const Route = createFileRoute('/resource/$id')({
  loader: ({ params }) => {
    const late = params.id.startsWith('late-')
    const wait = async () => {
      for (let i = 0; i < 8; i++) {
        await sleep0()
      }
    }
    const data = (late ? wait() : Promise.resolve()).then(() =>
      makeRichSerializationData(params.id),
    )
    return {
      data,
      second: late ? data.then(wait).then(() => data) : undefined,
      markup: late
        ? data
            .then(wait)
            .then(wait)
            .then(() => makeBigPayload(params.id))
        : undefined,
    }
  },
  component: ResourceComponent,
})

function ResourceComponent() {
  const data = Route.useLoaderData()
  return (
    <>
      <Suspense fallback={<p>Waiting</p>}>
        <Await promise={data().data}>
          {(value) => (
            <section>
              <h1>resource-{value.label}</h1>
              <p>{value.points[0]?.label}</p>
            </section>
          )}
        </Await>
      </Suspense>
      <Show when={data().second}>
        {(promise) => (
          <Suspense fallback={null}>
            <Await promise={promise()}>
              {(value) => <p>second-{value.label}</p>}
            </Await>
          </Suspense>
        )}
      </Show>
      <Show when={data().markup}>
        {(promise) => (
          <Suspense fallback={null}>
            <Await promise={promise()}>
              {(value) => (
                <section>
                  {value.chunks.map((chunk) => (
                    <p>{chunk.value}</p>
                  ))}
                </section>
              )}
            </Await>
          </Suspense>
        )}
      </Show>
    </>
  )
}
