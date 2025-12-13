import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

export const Route = createFileRoute('/method-not-allowed/post')({
  component: MethodNotAllowedFn,
})

export const postableServerFn = createServerFn({ method: 'POST' }).handler(
  () => {
    return new Response('Hello, World!')
  },
)

const fetchFn = async (method: string) => {
  const response = await fetch('/_serverFn/constant_id_3?createServerFn', {
    method,
  })
  return [response.status, await response.text()] as const
}

function MethodNotAllowedFn() {
  const [fetchResult, setFetchResult] = useState<
    readonly [number, string] | null
  >(null)
  return (
    <div className="flex flex-col gap-2">
      <h1>Method Not Allowed POST</h1>

      <button
        data-testid="get-button"
        onClick={() => fetchFn('GET').then(setFetchResult)}
      >
        Fetch GET
      </button>
      <button
        data-testid="post-button"
        onClick={() => fetchFn('POST').then(setFetchResult)}
      >
        Fetch POST
      </button>
      <button
        data-testid="put-button"
        onClick={() => fetchFn('PUT').then(setFetchResult)}
      >
        Fetch PUT
      </button>
      <button
        data-testid="options-button"
        onClick={() => fetchFn('OPTIONS').then(setFetchResult)}
      >
        Fetch OPTIONS
      </button>

      <pre data-testid="fetch-result">{JSON.stringify(fetchResult)}</pre>
    </div>
  )
}
