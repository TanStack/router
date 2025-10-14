import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import React from 'react'

export const Route = createFileRoute('/abort-signal')({
  component: () => {
    return (
      <div>
        <Test method="post" fn={abortableServerFnPost} />
        <hr />
        <Test method="get" fn={abortableServerFnGet} />
      </div>
    )
  },
})

const fn = createServerOnlyFn(async () => {
  const request = getRequest()
  const signal = request.signal
  console.log('server function started', { signal })
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
})

const abortableServerFnPost = createServerFn({ method: 'POST' }).handler(fn)

const abortableServerFnGet = createServerFn({ method: 'GET' }).handler(fn)
function Test({
  method,
  fn,
}: {
  method: string
  fn: typeof abortableServerFnPost | typeof abortableServerFnGet
}) {
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>(
    undefined,
  )
  const [result, setResult] = React.useState<string | undefined>(undefined)

  const reset = () => {
    setErrorMessage(undefined)
    setResult(undefined)
  }
  return (
    <div>
      <h2>Test {method}</h2>
      <button
        data-testid={`run-with-abort-btn-${method}`}
        onClick={async () => {
          reset()
          const controller = new AbortController()
          const serverFnPromise = fn({
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
        data-testid={`run-without-abort-btn-${method}`}
        onClick={async () => {
          reset()
          const serverFnResult = await fn()
          setResult(serverFnResult)
        }}
      >
        call server function
      </button>
      <div className="p-2">
        result: <p data-testid={`result-${method}`}>{result ?? '$undefined'}</p>
      </div>
      <div className="p-2">
        message:{' '}
        <p data-testid={`errorMessage-${method}`}>
          {errorMessage ?? '$undefined'}
        </p>
      </div>
    </div>
  )
}
