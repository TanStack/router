import { createServerOnlyFn } from '@tanstack/solid-start'
import { getRequest } from '@tanstack/solid-start/server'
import { Await, createFileRoute } from '@tanstack/solid-router'
import { Loading } from 'solid-js'
import { makeDeferredRecords } from '../../../deferred-records'
import type { DeferredRecord } from '../../../deferred-records'

const getRequestSignal = createServerOnlyFn(() => getRequest().signal)

export const Route = createFileRoute('/stream/$id')({
  loader: ({ params }) => ({
    eager: `eager-${params.id}`,
    alpha: makeDeferredRecords(params.id, 'alpha', getRequestSignal()),
    beta: makeDeferredRecords(params.id, 'beta', getRequestSignal()),
  }),
  component: StreamComponent,
})

function StreamComponent() {
  const data = Route.useLoaderData()

  return (
    <main data-bench="aborted-requests-stream">
      <p data-bench="aborted-requests-eager">{data().eager}</p>
      <Loading
        fallback={
          <p data-bench="aborted-requests-alpha-fallback">loading-alpha</p>
        }
      >
        <Await promise={data().alpha}>
          {(records) => (
            <DeferredRecords
              records={records}
              dataBench="aborted-requests-alpha"
            />
          )}
        </Await>
      </Loading>
      <Loading
        fallback={
          <p data-bench="aborted-requests-beta-fallback">loading-beta</p>
        }
      >
        <Await promise={data().beta}>
          {(records) => (
            <DeferredRecords
              records={records}
              dataBench="aborted-requests-beta"
            />
          )}
        </Await>
      </Loading>
    </main>
  )
}

function DeferredRecords(props: {
  records: Array<DeferredRecord>
  dataBench: string
}) {
  return (
    <ul data-bench={props.dataBench}>
      {props.records.map((record) => (
        <li>{record.label}</li>
      ))}
    </ul>
  )
}
