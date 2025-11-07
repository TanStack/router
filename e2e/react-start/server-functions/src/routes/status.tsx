import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'

const simpleSetFn = createServerFn().handler(() => {
  setResponseStatus(225, `hello`)
  return null
})

const requestSetFn = createServerFn().handler(() => {
  return new Response(undefined, { status: 226, statusText: `status-226` })
})

const bothSetFn = createServerFn().handler(() => {
  setResponseStatus(225, `status-225`)
  return new Response(undefined, { status: 226, statusText: `status-226` })
})

export const Route = createFileRoute('/status')({
  component: StatusComponent,
})

function StatusComponent() {
  const simpleSet = useServerFn(simpleSetFn)
  const requestSet = useServerFn(requestSetFn)
  const bothSet = useServerFn(bothSetFn)

  return (
    <div className="p-2">
      <button
        data-testid="invoke-server-fn-simple-set"
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
        onClick={() => {
          simpleSet()
        }}
      >
        click me
      </button>
      <button
        data-testid="invoke-server-fn-request-set"
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
        onClick={() => {
          requestSet()
        }}
      >
        click me
      </button>
      <button
        data-testid="invoke-server-fn-both-set"
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
        onClick={() => {
          bothSet()
        }}
      >
        click me
      </button>
    </div>
  )
}
