/**
 * This exported component is to test whether the url bound to the
 * server function is hardcoded to http://localhost:3000 or not.
 * @link https://github.com/TanStack/router/issues/2720
 */

import * as React from 'react'
import { createServerFn } from '@tanstack/start'

const boundedUrlServerFn = createServerFn().handler(async () => {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return { foo: 'bar' }
})

export function FunctionUrlNotHardcoded() {
  return (
    <div className="p-2 border m-2 grid gap-2">
      <h3>Sever Fn URL is hardcoded</h3>
      <p>
        <code>createServerFn().handler(...).url</code> should not be hardcoded
        to <code>http://localhost:3000</code>.
      </p>
      <div className="overflow-y-auto">
        <code>
          <pre data-testid="bounded-url-is-hardcoded">
            {boundedUrlServerFn.url}
          </pre>
        </code>
      </div>
    </div>
  )
}
