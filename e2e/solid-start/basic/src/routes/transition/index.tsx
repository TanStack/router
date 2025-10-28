import { Link, createFileRoute, TransitionSuspense } from '@tanstack/solid-router'
import { createResource } from 'solid-js'
import { z } from 'zod'

export const Route = createFileRoute('/transition/')({
  validateSearch: z.object({
    n: z.number().default(1),
  }),
  component: Home,
})

function Home() {
  return (
    <div class="p-2">
      <Link
        data-testid="increase-button"
        class="border bg-gray-50 px-3 py-1"
        from="/transition"
        search={(s) => ({ n: s.n + 1 })}
        startTransition
      >
        Increase
      </Link>

      <Result />
    </div>
  )
}

function Result() {
  const searchQuery = Route.useSearch()

  // Use regular createResource (not createTransitionAwareResource!)
  // TransitionSuspense makes it work seamlessly with transitions
  const [doubleQuery] = createResource(
    () => searchQuery().n,
    async (n) => {
      await new Promise((r) => setTimeout(r, 1000))
      return n * 2
    },
  )

  return (
    <div class="mt-2">
      {/* TransitionSuspense keeps old values visible during navigation */}
      <TransitionSuspense fallback="Loading...">
        <div data-testid="n-value">n: {searchQuery().n}</div>
        <div data-testid="double-value">double: {doubleQuery()}</div>
      </TransitionSuspense>
    </div>
  )
}
