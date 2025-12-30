import { createFileRoute } from '@tanstack/vue-router'
import { RawStream } from '@tanstack/vue-start'
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createDelayedStream,
  createStreamConsumer,
  encode,
} from '../../raw-stream-fns'

const SSRMultipleTest = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    const firstContent = ref('')
    const secondContent = ref('')
    const isConsuming = ref(true)
    const error = ref<string | null>(null)

    const consumeRawStreams = (
      first: ReadableStream<Uint8Array> | RawStream | undefined,
      second: ReadableStream<Uint8Array> | RawStream | undefined,
    ) => {
      if (!first || !second) {
        return Promise.resolve()
      }
      const consumeStream = createStreamConsumer()
      isConsuming.value = true
      error.value = null
      return Promise.all([consumeStream(first), consumeStream(second)])
        .then(([content1, content2]) => {
          firstContent.value = content1
          secondContent.value = content2
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
        () => [loaderData.value.first, loaderData.value.second],
        ([first, second]) => {
          if (
            hasStarted ||
            firstContent.value ||
            secondContent.value ||
            error.value ||
            !first ||
            !second
          ) {
            return
          }
          hasStarted = true
          void consumeRawStreams(first, second)
        },
        { immediate: true },
      )
    })

    onBeforeUnmount(() => {
      stopWatcher?.()
    })

    return () => (
      <div class="space-y-4">
        <h2>SSR Multiple RawStreams Test</h2>
        <p class="text-gray-600">
          This route returns multiple RawStreams from its loader. Each stream is
          independently serialized during SSR.
        </p>

        <div class="border p-4 rounded">
          <div data-testid="ssr-multiple-message">
            Message: {loaderData.value.message}
          </div>
          <div data-testid="ssr-multiple-first">
            First Stream:
            {error.value
              ? `Error: ${error.value}`
              : isConsuming.value
                ? 'Loading...'
                : firstContent.value}
          </div>
          <div data-testid="ssr-multiple-second">
            Second Stream:
            {error.value
              ? `Error: ${error.value}`
              : isConsuming.value
                ? 'Loading...'
                : secondContent.value}
          </div>
          <pre data-testid="ssr-multiple-result">
            {JSON.stringify({
              message: loaderData.value.message,
              firstContent: firstContent.value,
              secondContent: secondContent.value,
              isConsuming: isConsuming.value,
              error: error.value,
            })}
          </pre>
        </div>
      </div>
    )
  },
})

export const Route = createFileRoute('/raw-stream/ssr-multiple')({
  loader: async () => {
    const stream1 = createDelayedStream(
      [encode('multi-1a'), encode('multi-1b')],
      30,
    )
    const stream2 = createDelayedStream(
      [encode('multi-2a'), encode('multi-2b')],
      50,
    )
    return {
      message: 'SSR Multiple Streams Test',
      first: new RawStream(stream1),
      second: new RawStream(stream2),
    }
  },
  component: SSRMultipleTest,
})
