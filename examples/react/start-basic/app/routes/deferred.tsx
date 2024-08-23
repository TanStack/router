import { Await, createFileRoute, defer } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { Suspense, useState } from 'react'

const personServerFn = createServerFn('GET', async (name: string) => {
  await new Promise((r) => setTimeout(r, 1000))
  return { name, randomNumber: Math.floor(Math.random() * 100) }
})

export const Route = createFileRoute('/deferred')({
  loader: () => {
    return {
      deferredStuff: defer(
        new Promise<string>((r) =>
          setTimeout(() => r('Hello deferred!'), 5000),
        ),
      ),
      deferredPerson: defer(personServerFn('Tanner Linsley')),
    }
  },
  component: Deferred,
})

function Deferred() {
  const [count, setCount] = useState(0)
  const { deferredStuff, deferredPerson } = Route.useLoaderData()

  return (
    <div className="p-2">
      <Suspense fallback={<div>Loading person...</div>}>
        <Await
          promise={deferredPerson}
          children={(data) => (
            <div data-testid="deferred-person">
              {data.name} - {data.randomNumber}
            </div>
          )}
        />
      </Suspense>
      <Suspense fallback={<div>Loading stuff...</div>}>
        <Await promise={deferredStuff} children={(data) => <h3>{data}</h3>} />
      </Suspense>
      <div>Count: {count}</div>
      <div>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </div>
  )
}
