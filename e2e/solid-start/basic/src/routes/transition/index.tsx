import {
  Link,
  createFileRoute,
  createTransitionAwareResource,
} from '@tanstack/solid-router'
import { Suspense } from 'solid-js'
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

  // Use createTransitionAwareResource instead of createResource
  // This automatically keeps old values visible during navigation
  const [doubleQuery] = createTransitionAwareResource(
    () => searchQuery().n,
    async (n) => {
      await new Promise((r) => setTimeout(r, 1000))
      return n * 2
    },
  )

  return (
    <div class="mt-2">
      {/* Regular Suspense works great with createTransitionAwareResource! */}
      <Suspense fallback="Loading...">
        <div data-testid="n-value">n: {searchQuery().n}</div>
        <div data-testid="double-value">double: {doubleQuery()}</div>
      </Suspense>
    </div>
  )
}
