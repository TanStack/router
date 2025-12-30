import { Await, createFileRoute } from '@tanstack/vue-router'
import { RawStream } from '@tanstack/vue-start'
import {
  Suspense,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  createDelayedStream,
  createStreamConsumer,
  encode,
} from '../../raw-stream-fns'

const SSRMixedTest = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    const streamContent = ref('')
    const isConsuming = ref(true)
    const error = ref<string | null>(null)

    const consumeRawStream = (
      rawData: ReadableStream<Uint8Array> | RawStream | undefined,
    ) => {
      if (!rawData) {
        return Promise.resolve()
      }
      const consumeStream = createStreamConsumer()
      isConsuming.value = true
      error.value = null
      return consumeStream(rawData)
        .then((content) => {
          streamContent.value = content
          isConsuming.value = false
        })
        .catch((err) => {
          error.value = String(err)
          isConsuming.value = false
        })
    }

    let stopWatcher: (() => void) | undefined
    let hasStarted = false

    onMounted(() => {
      stopWatcher = watch(
        () => loaderData.value.rawData,
        (rawData) => {
          if (hasStarted || streamContent.value || error.value || !rawData) {
            return
          }
          hasStarted = true
          void consumeRawStream(rawData)
        },
        { immediate: true },
      )
    })

    onBeforeUnmount(() => {
      stopWatcher?.()
    })

    return () => (
      <div class="space-y-4">
        <h2>SSR Mixed Streaming Test</h2>
        <p class="text-gray-600">
          This route returns a mix of immediate data, deferred promises, and
          RawStream from its loader.
        </p>

        <div class="border p-4 rounded">
          <div data-testid="ssr-mixed-immediate">
            Immediate: {loaderData.value.immediate}
          </div>
          <div data-testid="ssr-mixed-deferred">
            Deferred:
            <Suspense>
              {{
                default: () => (
                  <Await
                    promise={loaderData.value.deferred}
                    children={(value: string) => <span>{value}</span>}
                  />
                ),
                fallback: () => <span>Loading deferred...</span>,
              }}
            </Suspense>
          </div>
          <div data-testid="ssr-mixed-stream">
            Stream Content:
            {error.value
              ? `Error: ${error.value}`
              : isConsuming.value
                ? 'Loading...'
                : streamContent.value}
          </div>
          <pre data-testid="ssr-mixed-result">
            {JSON.stringify({
              immediate: loaderData.value.immediate,
              streamContent: streamContent.value,
              isConsuming: isConsuming.value,
              error: error.value,
            })}
          </pre>
        </div>
      </div>
    )
  },
})

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
