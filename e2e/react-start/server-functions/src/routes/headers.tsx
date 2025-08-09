import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseHeaders } from '@tanstack/react-start/server'
import type { HTTPHeaderName } from '@tanstack/react-start/server'

export const Route = createFileRoute('/headers')({
  loader: async () => {
    return {
      testHeaders: await getTestHeaders(),
    }
  },
  component: () => {
    const { testHeaders } = Route.useLoaderData()
    return <ResponseHeaders initialTestHeaders={testHeaders} />
  },
})

export const getTestHeaders = createServerFn().handler(() => {
  setResponseHeaders('x-test-header', 'test-value')

  return {
    serverHeaders: getRequestHeaders(),
    headers: getRequestHeaders(),
  }
})

type TestHeadersResult = {
  headers?: Partial<Record<HTTPHeaderName, string | undefined>>
  serverHeaders?: Partial<Record<HTTPHeaderName, string | undefined>>
}

function ResponseHeaders({
  initialTestHeaders,
}: {
  initialTestHeaders: TestHeadersResult
}) {
  const [testHeadersResult, setTestHeadersResult] =
    React.useState<TestHeadersResult | null>(null)

  return (
    <div className="p-2 m-2 grid gap-2">
      <h3>Headers Test</h3>
      <form
        className="flex flex-col gap-2"
        data-testid="serialize-formdata-form"
        onSubmit={(evt) => {
          evt.preventDefault()
          getTestHeaders().then(setTestHeadersResult)
        }}
      >
        <button
          type="submit"
          data-testid="test-headers-btn"
          className="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Get Headers
        </button>
      </form>
      <div className="overflow-y-auto">
        <h4>Initial Headers:</h4>
        <pre data-testid="initial-headers-result">
          {JSON.stringify(initialTestHeaders.headers, null, 2)}
        </pre>
        {testHeadersResult && (
          <>
            <h4>Updated Headers:</h4>
            <pre data-testid="updated-headers-result">
              {JSON.stringify(testHeadersResult.headers, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}
