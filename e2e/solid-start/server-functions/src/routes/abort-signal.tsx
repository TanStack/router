import { createFileRoute } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import * as Solid from 'solid-js'

export const Route = createFileRoute('/abort-signal')({
  component: RouteComponent,
})

const abortableServerFn = createServerFn().handler(
  async ({ context, signal }) => {
    console.log('server function started', { context, signal })
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        return reject(new Error('Aborted before start'))
      }
      const timerId = setTimeout(() => {
        console.log('server function finished')
        resolve('server function result')
      }, 1000)
      const onAbort = () => {
        clearTimeout(timerId)
        console.log('server function aborted')
        reject(new Error('Aborted'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  },
)

function RouteComponent() {
  const [errorMessage, setErrorMessage] = Solid.createSignal<
    string | undefined
  >(undefined)
  const [result, setResult] = Solid.createSignal<string | undefined>(undefined)

  const reset = () => {
    setErrorMessage(undefined)
    setResult(undefined)
  }
  return (
    <div>
      <button
        data-testid="run-with-abort-btn"
        onClick={async () => {
          reset()
          const controller = new AbortController()
          const serverFnPromise = abortableServerFn({
            signal: controller.signal,
          })
          const timeoutPromise = new Promise((resolve) =>
            setTimeout(resolve, 500),
          )
          await timeoutPromise
          controller.abort()
          try {
            const serverFnResult = await serverFnPromise
            setResult(serverFnResult)
          } catch (error) {
            setErrorMessage((error as any).message)
          }
        }}
      >
        call server function with abort signal
      </button>
      <br />
      <button
        data-testid="run-without-abort-btn"
        onClick={async () => {
          reset()
          const serverFnResult = await abortableServerFn()
          setResult(serverFnResult)
        }}
      >
        call server function
      </button>
      <div class="p-2">
        result: <p data-testid="result">{result() ?? '$undefined'}</p>
      </div>
      <div class="p-2">
        message:{' '}
        <p data-testid="errorMessage">{errorMessage() ?? '$undefined'}</p>
      </div>
    </div>
  )
}
