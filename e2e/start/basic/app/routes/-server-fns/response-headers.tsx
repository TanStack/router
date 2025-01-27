import * as React from 'react'
import { createServerFn } from '@tanstack/start'
import { getHeaders, setHeader } from '@tanstack/start/server'
import type { HTTPHeaderName } from '@tanstack/start/server'

export const getTestHeaders = createServerFn().handler(() => {
  setHeader('x-test-header', 'test-value')

  return {
    serverHeaders: getHeaders(),
    headers: getHeaders(),
  }
})

type TestHeadersResult = {
  headers?: Partial<Record<HTTPHeaderName, string | undefined>>
  serverHeaders?: Partial<Record<HTTPHeaderName, string | undefined>>
}

// Usage
export function ResponseHeaders({
  initialTestHeaders,
}: {
  initialTestHeaders: TestHeadersResult
}) {
  const [testHeadersResult, setTestHeadersResult] =
    React.useState<TestHeadersResult>(initialTestHeaders)

  return (
    <div className="p-2 border m-2 grid gap-2">
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
        <h4>Headers:</h4>
        <pre data-testid="test-headers-result">
          {JSON.stringify(testHeadersResult.headers, null, 2)}
        </pre>
      </div>
    </div>
  )
}
