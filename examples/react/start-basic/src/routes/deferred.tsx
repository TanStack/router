import { Await } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Suspense, useState } from 'react'

const personServerFn = createServerFn({ method: 'GET' })
  .validator((d: string) => d)
  .handler(({ data: name }) => {
    return { name, randomNumber: Math.floor(Math.random() * 100) }
  })

const slowServerFn = createServerFn({ method: 'GET' })
  .validator((d: string) => d)
  .handler(async ({ data: name }) => {
    await new Promise((r) => setTimeout(r, 1000))
    return { name, randomNumber: Math.floor(Math.random() * 100) }
  })

export const Route = createFileRoute({
  loader: async () => {
    return {
      deferredStuff: new Promise<string>((r) =>
        setTimeout(() => r('Hello deferred!'), 2000),
      ),
      deferredPerson: slowServerFn({ data: 'Tanner Linsley' }),
      person: await personServerFn({ data: 'John Doe' }),
    }
  },
  component: Deferred,
})

function Deferred() {
  const [count, setCount] = useState(0)
  const { deferredStuff, deferredPerson, person } = Route.useLoaderData()

  return (
    <div className="p-2">
      <div data-testid="regular-person">
        {person.name} - {person.randomNumber}
      </div>
      <Suspense fallback={<div>Loading person...</div>}>
        <Await promise={deferredPerson}>
					{(data) => (
						<div data-testid="deferred-person">
							{data.name} - {data.randomNumber}
						</div>
					)}
				</Await>
      </Suspense>
      <Suspense fallback={<div>Loading stuff...</div>}>
        <Await promise={deferredStuff}>
					{(data) => <h3 data-testid="deferred-stuff">{data}</h3>}
				</Await>
      </Suspense>
      <div>Count: {count}</div>
      <div>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </div>
  )
}
