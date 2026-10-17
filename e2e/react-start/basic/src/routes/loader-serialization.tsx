import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/loader-serialization')({
  loader: () => ({
    title: 'Serializable loader data',
    publishedAt: new Date('2026-01-02T03:04:05.000Z'),
    labels: new Map([['language', 'TypeScript']]),
    tags: new Set(['react', 'start']),
    total: 9007199254740993n,
    optional: undefined,
  }),
  component: Example,
})

function Example() {
  const data = Route.useLoaderData()
  const [count, setCount] = useState(0)
  return (
    <>
      <h1>{data.title}</h1>
      <p data-testid="date">{data.publishedAt.toISOString()}</p>
      <p data-testid="map">{data.labels.get('language')}</p>
      <p data-testid="set">{Array.from(data.tags).join(', ')}</p>
      <p data-testid="bigint">{(data.total + 1n).toString()}</p>
      <p data-testid="optional">
        {data.optional === undefined ? 'absent' : 'present'}
      </p>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </>
  )
}
