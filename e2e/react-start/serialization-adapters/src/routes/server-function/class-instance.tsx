import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { makeAsyncFoo, makeFoo } from '~/data'

const serverFn = createServerFn()
  .handler(() => {
    return {
        asyncFoo: makeAsyncFoo('-serverFn'),
        foo: makeFoo('-serverFn')
    }
  })

export const Route = createFileRoute('/server-function/class-instance')({
  component: RouteComponent,
})

function RouteComponent() {
    const [resp, setResp] = useState<any>(null)

  return <div>
          <button
        data-testid="server-function-btn"
        onClick={() =>
          serverFn().then(setResp)
        }
      >
        trigger serverFn
      </button>
      <div data-testid="server-function-foo-response">
        {JSON.stringify(resp?.foo?.value)}
      </div>
      <div data-testid="server-function-async-foo-response">
        {JSON.stringify(resp?.asyncFoo?.echo())}
      </div>
  </div>
}
