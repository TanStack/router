import { useRouter } from './useRouter'
import { Show, Suspense, createMemo } from 'solid-js'
import type { JSX } from 'solid-js'

interface TransitionSuspenseProps {
  fallback?: JSX.Element
  children: JSX.Element
}

/**
 * A Suspense wrapper that keeps old content visible during router transitions.
 *
 * During navigation with startTransition, this prevents the fallback from showing,
 * allowing old content to remain visible until new content is ready.
 *
 * This enables regular `createResource()` to work seamlessly with transitions
 * without needing `createTransitionAwareResource()`.
 *
 * @example
 * ```tsx
 * function UserPage() {
 *   const params = useParams()
 *   const [user] = createResource(() => params.userId, fetchUser)
 *
 *   return (
 *     <TransitionSuspense fallback="Loading...">
 *       <div>{user()?.name}</div>
 *     </TransitionSuspense>
 *   )
 * }
 * ```
 */
export function TransitionSuspense(props: TransitionSuspenseProps) {
  const router = useRouter()
  const isTransitioning = createMemo(() => router.isTransitioning?.() ?? false)

  return (
    <Show
      when={!isTransitioning()}
      fallback={
        // During transitions, render children directly without Suspense
        // This keeps old content visible even if resources are loading
        props.children
      }
    >
      {/* When not transitioning, use normal Suspense behavior */}
      <Suspense fallback={props.fallback}>{props.children}</Suspense>
    </Show>
  )
}
