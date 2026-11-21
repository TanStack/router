'use client'

import * as React from 'react'

/** A client component rendered inside `<ClientOnly>` by server components. */
export function ClientOnlyCounter({ label }: { label: string }) {
  const [count, setCount] = React.useState(0)
  return (
    <button
      type="button"
      data-testid={`client-only-counter-${label}`}
      onClick={() => setCount((n) => n + 1)}
    >
      {label}: {count}
    </button>
  )
}
