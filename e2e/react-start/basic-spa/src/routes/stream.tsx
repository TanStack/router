import { Await, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/stream')({
  component: Home,
  loader() {
    return {
      promise: new Promise<string>((resolve) =>
        setTimeout(() => resolve('promise-data'), 150),
      ),
      stream: new ReadableStream({
        async start(controller) {
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 200))
            controller.enqueue(`stream-data-${i} `)
          }
          controller.close()
        },
      }),
    }
  },
})

const decoder = new TextDecoder('utf-8')

function Home() {
  const { promise, stream } = Route.useLoaderData()
  const [streamData, setStreamData] = useState<Array<string>>([])

  useEffect(() => {
    let cancelled = false
    setStreamData([])

    async function fetchStream() {
      const reader = stream.getReader()
      let chunk

      try {
        while (!(chunk = await reader.read()).done) {
          let value = chunk.value
          if (typeof value !== 'string') {
            value = decoder.decode(value, { stream: true })
          }
          if (!cancelled) {
            setStreamData((prev) => [...prev, value])
          }
        }
      } finally {
        reader.releaseLock()
      }
    }

    fetchStream()

    return () => {
      cancelled = true
    }
  }, [stream])

  return (
    <>
      <Await
        promise={promise}
        children={(promiseData) => (
          <div className="p-2" data-testid="promise-data">
            {promiseData}
            <div data-testid="stream-data">
              {streamData.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
          </div>
        )}
      />
    </>
  )
}
