import { Await, createFileRoute } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'

export const Route = createFileRoute('/stream')({
  component: Home,
  loader() {
    return {
      promise: new Promise<string>((resolve) =>
        setTimeout(() => resolve('promise-data'), 150),
      ),
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue('stream-data-1')
          setTimeout(() => {
            controller.enqueue('stream-data-2')
          }, 300)
          setTimeout(() => {
            controller.enqueue('stream-data-3')
          }, 450)
          setTimeout(() => {
            controller.close()
          }, 600)
        },
      }),
    }
  },
})

function Home() {
  const { promise, stream } = Route.useLoaderData()

  const [streamData, setStreamData] = useState('')

  useEffect(() => {
    async function fetchStream() {
      const reader = stream.getReader()
      const decoder = new TextDecoder('utf-8')
      let result = ''
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          const decoded = decoder.decode(value, { stream: !done })
          result += decoded
        }
      }
      setStreamData(result)
    }

    fetchStream()
  }, [])

  return (
    <Await
      promise={promise}
      children={(promiseData) => (
        <div className="p-2">
          <h3 data-testid="promise-data">{promiseData}</h3>
          <h3 data-testid="stream-data">{streamData}</h3>
        </div>
      )}
    ></Await>
  )
}
