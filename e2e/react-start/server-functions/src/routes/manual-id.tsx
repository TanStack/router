import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'

const manualIdServerFn = createServerFn({ id: 'manual-id-hello' }).handler(
  () => 'manual id response',
)

export const Route = createFileRoute('/manual-id')({
  component: ManualIdComponent,
})

function ManualIdComponent() {
  const invokeManualIdServerFn = useServerFn(manualIdServerFn)
  const [result, setResult] = useState('')

  return (
    <div>
      <button
        type="button"
        data-testid="invoke-manual-id-server-fn"
        onClick={async () => {
          setResult(await invokeManualIdServerFn())
        }}
      >
        Invoke manual ID server function
      </button>
      <output data-testid="manual-id-result">{result}</output>
    </div>
  )
}
