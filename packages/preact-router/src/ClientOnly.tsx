import { Fragment } from 'preact'
import { useSyncExternalStore } from 'preact/compat'
import type { ComponentChildren } from 'preact'

export interface ClientOnlyProps {
  /**
   * The children to render when the JS is loaded.
   */
  children: ComponentChildren
  /**
   * The fallback component to render if the JS is not yet loaded.
   */
  fallback?: ComponentChildren
}

/**
 * Render the children only after the JS has loaded client-side. Use an optional
 * fallback component if the JS is not yet loaded.
 *
 * @example
 * Render a Chart component if JS loads, renders a simple FakeChart
 * component server-side or if there is no JS. The FakeChart can have only the
 * UI without the behavior or be a loading spinner or skeleton.
 *
 * ```tsx
 * return (
 *   <ClientOnly fallback={<FakeChart />}>
 *     <Chart />
 *   </ClientOnly>
 * )
 * ```
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  return useHydrated() ? (
    <Fragment>{children}</Fragment>
  ) : (
    <Fragment>{fallback}</Fragment>
  )
}

/**
 * Return a boolean indicating if the JS has been hydrated already.
 * When doing Server-Side Rendering, the result will always be false.
 * When doing Client-Side Rendering, the result will always be false on the
 * first render and true from then on. Even if a new component renders it will
 * always start with true.
 *
 * @example
 * ```tsx
 * // Disable a button that needs JS to work.
 * let hydrated = useHydrated()
 * return (
 *   <button type="button" disabled={!hydrated} onClick={doSomethingCustom}>
 *     Click me
 *   </button>
 * )
 * ```
 * @returns True if the JS has been hydrated already, false otherwise.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
  )
}

function subscribe() {
  return () => {}
}
