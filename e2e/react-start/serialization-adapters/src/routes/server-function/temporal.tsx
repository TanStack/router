import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { TemporalData } from '~/temporal'
import { RenderTemporalData, makeTemporalData } from '~/temporal'

const temporalFn = createServerFn().handler(() => {
  return makeTemporalData()
})

export const Route = createFileRoute('/server-function/temporal')({
  component: RouteComponent,
})

function RouteComponent() {
  const [temporalResponse, setTemporalResponse] = useState<TemporalData>()

  return (
    <div>
      <button
        data-testid="server-function-trigger"
        onClick={() => temporalFn().then(setTemporalResponse)}
      >
        trigger
      </button>

      {temporalResponse ? (
        <RenderTemporalData id="server-fn" data={temporalResponse} />
      ) : (
        <div data-testid="waiting-for-response">waiting for response...</div>
      )}
    </div>
  )
}
