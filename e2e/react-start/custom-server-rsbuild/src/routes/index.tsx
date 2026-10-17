import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
// A `!` prefix skips the configured normal loaders, such as builtin SWC, but
// still runs pre loaders, including the Start compiler.
// @ts-expect-error TypeScript can't resolve the inline loader prefix.
import { getInlineLoaderGreeting } from '!../functions/inline-loader-fn.js'

const getGreeting = createServerFn()
  .validator((d: { name: string }) => d)
  .handler(({ data }) => ({ greeting: `Hello, ${data.name}!` }))

const postMessage = createServerFn({ method: 'POST' })
  .validator((d: { message: string }) => d)
  .handler(({ data }) => ({ echo: `Echo: ${data.message}` }))

export const Route = createFileRoute('/')({
  loader: async () => {
    const result = await getGreeting({ data: { name: 'Loader' } })
    return { loaderGreeting: result.greeting }
  },
  component: ServerFnsComponent,
})

function ServerFnsComponent() {
  const { loaderGreeting } = Route.useLoaderData()
  const [clientGreeting, setClientGreeting] = useState<string>('')
  const [echoResult, setEchoResult] = useState<string>('')
  const [inlineLoaderGreeting, setInlineLoaderGreeting] = useState<string>('')

  return (
    <div className="p-2">
      <h3>Server Functions</h3>

      <section className="mt-2">
        <h4>Loader (SSR)</h4>
        <p data-testid="loader-greeting">{loaderGreeting}</p>
      </section>

      <section className="mt-2">
        <h4>GET server function</h4>
        <button
          type="button"
          onClick={async () => {
            const result = await getGreeting({ data: { name: 'Client' } })
            setClientGreeting(result.greeting)
          }}
          className="px-2 py-1 bg-blue-600 text-white rounded"
        >
          Call getGreeting
        </button>
        {clientGreeting && (
          <p data-testid="client-greeting">{clientGreeting}</p>
        )}
      </section>

      <section className="mt-2">
        <h4>POST server function</h4>
        <button
          type="button"
          onClick={async () => {
            const result = await postMessage({
              data: { message: 'hello from client' },
            })
            setEchoResult(result.echo)
          }}
          className="px-2 py-1 bg-blue-600 text-white rounded"
        >
          Call postMessage
        </button>
        {echoResult && <p data-testid="echo-result">{echoResult}</p>}
      </section>

      <section className="mt-2">
        <h4>Server function imported with a `!` prefix</h4>
        <button
          type="button"
          onClick={async () => {
            const result = await getInlineLoaderGreeting()
            setInlineLoaderGreeting(result.greeting)
          }}
          className="px-2 py-1 bg-blue-600 text-white rounded"
        >
          Call getInlineLoaderGreeting
        </button>
        {inlineLoaderGreeting && (
          <p data-testid="inline-loader-greeting">{inlineLoaderGreeting}</p>
        )}
      </section>
    </div>
  )
}
