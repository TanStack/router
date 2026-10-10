import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { describeMoney, getBudget } from '~/Money'

export const Route = createFileRoute('/server-function/same-module-class')({
  component: RouteComponent,
})

function RouteComponent() {
  const [result, setResult] = useState('waiting for response...')

  return (
    <div>
      <button
        data-testid="same-module-class-trigger"
        onClick={() =>
          getBudget().then(
            (budget) => setResult(describeMoney(budget)),
            (error: Error) => setResult(`error: ${error.message}`),
          )
        }
      >
        trigger
      </button>
      <div data-testid="same-module-class-result">{result}</div>
    </div>
  )
}
