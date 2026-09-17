import * as Solid from 'solid-js'

/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param callback - The callback to call when the intersection changes
 * @param disabled - Whether observation is disabled
 * @returns The IntersectionObserver instance
 * @example
 * ```tsx
 * const MyComponent = () => {
 * const ref = React.useRef<HTMLDivElement>(null)
 * useIntersectionObserver(
 *  ref,
 *  (entry) => { doSomething(entry) },
 *  false
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry?: IntersectionObserverEntry) => void,
  disabled: Solid.Accessor<boolean>,
): Solid.Accessor<IntersectionObserver | null> {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'
  let observerRef: IntersectionObserver | null = null

  Solid.createEffect(
    () => [ref(), disabled()] as const,
    ([r, isDisabled]) => {
      if (isDisabled || !r || !isIntersectionObserverAvailable) {
        return () => callback()
      }

      observerRef = new IntersectionObserver(
        (entries) => {
          callback(entries.pop())
        },
        { rootMargin: '100px' },
      )

      observerRef.observe(r)

      return () => {
        observerRef?.disconnect()
        callback()
      }
    },
  )

  return () => observerRef
}
