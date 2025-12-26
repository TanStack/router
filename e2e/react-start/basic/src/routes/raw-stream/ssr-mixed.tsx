import { createFileRoute, Await } from '@tanstack/react-router'
import * as React from 'react'
import { RawStream } from '@tanstack/react-start'
import { createStreamConsumer } from '../../raw-stream-fns'

// Helper to encode text to Uint8Array
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// Helper to create a delayed stream
function createDelayedStream(
  chunks: Array<Uint8Array>,
  delayMs: number,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

export const Route = createFileRoute('/raw-stream/ssr-mixed')({
  loader: async () => {
    const rawStream = createDelayedStream(
      [encode('mixed-ssr-1'), encode('mixed-ssr-2')],
      50,
    )

    // Deferred promise that resolves after a delay
    const deferredData = new Promise<string>((resolve) =>
      setTimeout(() => resolve('deferred-ssr-value'), 100),
    )

    return {
      immediate: 'immediate-ssr-value',
      deferred: deferredData,
      rawData: new RawStream(rawStream),
    }
  },
  component: SSRMixedTest,
})

function SSRMixedTest() {
  const { immediate, deferred, rawData } = Route.useLoaderData()
  const [streamContent, setStreamContent] = React.useState<string>('')
  const [isConsuming, setIsConsuming] = React.useState(true)

  React.useEffect(() => {
    const consumeStream = createStreamConsumer()
    consumeStream(rawData).then((content) => {
      setStreamContent(content)
      setIsConsuming(false)
    })
  }, [rawData])

  return (
    <div className="space-y-4">
      <h2>SSR Mixed Streaming Test</h2>
      <p className="text-gray-600">
        This route returns a mix of immediate data, deferred promises, and
        RawStream from its loader.
      </p>

      <div className="border p-4 rounded">
        <div data-testid="ssr-mixed-immediate">Immediate: {immediate}</div>
        <div data-testid="ssr-mixed-deferred">
          Deferred:{' '}
          <React.Suspense fallback="Loading deferred...">
            <Await promise={deferred}>{(value) => <span>{value}</span>}</Await>
          </React.Suspense>
        </div>
        <div data-testid="ssr-mixed-stream">
          Stream Content: {isConsuming ? 'Loading...' : streamContent}
        </div>
        <pre data-testid="ssr-mixed-result">
          {JSON.stringify({ immediate, streamContent, isConsuming })}
        </pre>
      </div>
    </div>
  )
}
