import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { Suspense, createSignal } from 'solid-js'

const personServerFn = createServerFn({ method: 'GET' })
  .validator((data: { name: string }) => data)
  .handler(({ data }) => {
    return { name: data.name, randomNumber: Math.floor(Math.random() * 100) }
  })

const slowServerFn = createServerFn({ method: 'GET' })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 1000))
    return { name: data.name, randomNumber: Math.floor(Math.random() * 100) }
  })

export const Route = createFileRoute('/deferred')({
  loader: async () => {
    return {
      deferredStuff: new Promise<string>((r) =>
        setTimeout(() => r('Hello deferred!'), 2000),
      ),
      deferredPerson: slowServerFn({ data: { name: 'Tanner Linsley' } }),
      person: await personServerFn({ data: { name: 'John Doe' } }),
    }
  },
  component: Deferred,
})

function Deferred() {
  const [count, setCount] = createSignal(0)
  // const { deferredStuff, deferredPerson, person } = Route.useLoaderData()
  const loaderData = Route.useLoaderData()

  return (
    <div class="p-2">
      <div data-testid="regular-person">
        {loaderData().person.name} - {loaderData().person.randomNumber}
      </div>
      <Suspense fallback={<div>Loading person...</div>}>
        <Await
          promise={loaderData().deferredPerson}
          children={(data) => (
            <div data-testid="deferred-person">
              {data.name} - {data.randomNumber}
            </div>
          )}
        />
      </Suspense>
      <Suspense fallback={<div>Loading stuff...</div>}>
        <Await
          promise={loaderData().deferredStuff}
          children={(data) => <h3 data-testid="deferred-stuff">{data}</h3>}
        />
      </Suspense>
      <div>Count: {count()}</div>
      <div>
        <button onClick={() => setCount(count => count + 1)}>Increment</button>
      </div>
    </div>
  )
}
