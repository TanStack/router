import { Await, createFileRoute } from '@tanstack/solid-router'
import { Loading, createEffect, createSignal } from 'solid-js'
import {
  createChunkStream,
  createStreamPromise,
} from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/stream')({
  component: StreamRoute,
  loader() {
    return {
      promise: createStreamPromise(),
      stream: createChunkStream(),
    }
  },
})

const decoder = new TextDecoder('utf-8')

function StreamRoute() {
  const data = Route.useLoaderData()
  const [streamData, setStreamData] = createSignal<Array<string>>([])
  const [streamComplete, setStreamComplete] = createSignal(false)
  let reader: ReadableStreamDefaultReader | undefined

  createEffect(
    // Solid 2 would consume a stream returned directly as an async source.
    () => ({ stream: data().stream }),
    ({ stream }) => {
      if (stream.locked) {
        return
      }

      setStreamData([])
      setStreamComplete(false)

      async function readStream() {
        try {
          reader = stream.getReader()
          let chunk
          while (!(chunk = await reader.read()).done) {
            let value = chunk.value
            if (typeof value !== 'string') {
              value = decoder.decode(value, { stream: !chunk.done })
            }
            setStreamData((prev) => [...prev, value])
          }
          setStreamComplete(true)
        } catch (e) {
          if (!(e instanceof TypeError && String(e).includes('cancelled'))) {
            console.error('Stream error:', e)
          }
        }
      }

      void readStream()
      return () => {
        reader?.cancel().catch(() => {})
        reader = undefined
      }
    },
  )

  return (
    <div style={{ padding: '20px' }}>
      <h2>ReadableStream Test</h2>
      <Loading
        fallback={<div data-testid="promise-loading">Loading promise...</div>}
      >
        <Await
          promise={data().promise}
          children={(value) => <div data-testid="promise-data">{value}</div>}
        />
      </Loading>
      <div data-testid="stream-container">
        <h3>Stream chunks:</h3>
        <div data-testid="stream-data">
          {streamData().map((chunk, i) => (
            <div data-testid={`stream-chunk-${i}`}>{chunk}</div>
          ))}
        </div>
        {streamComplete() && (
          <div data-testid="stream-complete">Stream complete!</div>
        )}
      </div>
    </div>
  )
}
