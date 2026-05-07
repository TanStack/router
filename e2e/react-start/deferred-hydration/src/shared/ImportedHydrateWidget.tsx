import * as React from 'react'
import { Hydrate } from '@tanstack/react-start'
import { media } from '@tanstack/react-start/hydration'

function ImportedHydrateChild() {
  const [count, setCount] = React.useState(0)

  return (
    <button
      data-testid="imported-hydrate-child"
      data-marker="imported-hydrate-child"
      onClick={() => setCount((prev) => prev + 1)}
    >
      Imported Hydrate Child:{' '}
      <span data-testid="imported-hydrate-count">{count}</span>
    </button>
  )
}

export function ImportedHydrateWidget() {
  return (
    <Hydrate
      when={media('(max-width: 1px)')}
      fallback={
        <div data-testid="imported-hydrate-fallback">
          imported hydrate fallback
        </div>
      }
    >
      <ImportedHydrateChild />
    </Hydrate>
  )
}
