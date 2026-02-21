import { Await, createFileRoute } from '@tanstack/solid-router'
import { RawStream } from '@tanstack/solid-start'
import { Loading, createEffect, createSignal } from 'solid-js'
import {
  createDelayedStream,
  createStreamConsumer,
  encode,
} from '../../raw-stream-fns'

function SSRMixedTest() {
  const loaderData = Route.useLoaderData()
  const [streamContent, setStreamContent] = createSignal('')
  const [isConsuming, setIsConsuming] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(loaderData, (loaderDataValue) => {
    const rawData = loaderDataValue.rawData
    if (!rawData) {
      return
    }
    const consumeStream = createStreamConsumer()
    setIsConsuming(true)
    setError(null)
    consumeStream(rawData)
      .then((content) => {
        setStreamContent(content)
        setIsConsuming(false)
      })
      .catch((err) => {
        setError(String(err))
        setIsConsuming(false)
      })
  })

  return (
    <div class="space-y-4">
      <h2>SSR Mixed Streaming Test</h2>
      <p class="text-gray-600">
        This route returns a mix of immediate data, deferred promises, and
        RawStream from its loader.
      </p>

      <div class="border p-4 rounded">
        <div data-testid="ssr-mixed-immediate">
          Immediate: {loaderData().immediate}
        </div>
        <div data-testid="ssr-mixed-deferred">
          Deferred:
          <Loading fallback={<span>Loading deferred...</span>}>
            <Await
              promise={loaderData().deferred}
              children={(value: string) => <span>{value}</span>}
            />
          </Loading>
        </div>
        <div data-testid="ssr-mixed-stream">
          Stream Content:
          {error()
            ? `Error: ${error()}`
            : isConsuming()
              ? 'Loading...'
              : streamContent()}
        </div>
        <pre data-testid="ssr-mixed-result">
          {JSON.stringify({
            immediate: loaderData().immediate,
            streamContent: streamContent(),
            isConsuming: isConsuming(),
            error: error(),
          })}
        </pre>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/raw-stream/ssr-mixed')({
  loader: () => {
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
