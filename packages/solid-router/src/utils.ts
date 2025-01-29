import * as Solid from 'solid-js'
import type { RouteIds } from './routeInfo'
import type { AnyRouter } from './router'
import type { ConstrainLiteral } from '@tanstack/router-core'

export type StrictOrFrom<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean = true,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
    }
  : {
      from: ConstrainLiteral<TFrom, RouteIds<TRouter['routeTree']>>
      strict?: TStrict
    }

export const useLayoutEffect =
  typeof window !== 'undefined' ? Solid.createRenderEffect : Solid.createEffect

/**
 * Taken from https://www.developerway.com/posts/implementing-advanced-use-previous-hook#part3
 */
export function usePrevious<T>(value: T): T | null {
  // initialise the ref with previous and current values
  let ref: { value: T; prev: T | null } = {
    value: value,
    prev: null,
  }

  const current = ref.value

  // if the value passed into hook doesn't match what we store as "current"
  // move the "current" to the "previous"
  // and store the passed value as "current"
  if (value !== current) {
    ref = {
      value: value,
      prev: current,
    }
  }

  // return the previous value only
  return ref.prev
}


/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param intersectionObserverOptions - The options to pass to the IntersectionObserver
 * @param options - The options to pass to the hook
 * @param callback - The callback to call when the intersection changes
 * @returns The IntersectionObserver instance
 * @example
 * ```tsx
 * const MyComponent = () => {
 * const ref = React.useRef<HTMLDivElement>(null)
 * useIntersectionObserver(
 *  ref,
 *  (entry) => { doSomething(entry) },
 *  { rootMargin: '10px' },
 *  { disabled: false }
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: Solid.Accessor<T | null>,
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit = {},
  options: { disabled?: boolean } = {},
): Solid.Accessor<IntersectionObserver | null> {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'
  let observerRef: IntersectionObserver | null = null

  Solid.createEffect(() => {
    const r = ref()
    if (!r || !isIntersectionObserverAvailable || options.disabled) {
      return
    }

    observerRef = new IntersectionObserver(([entry]) => {
      callback(entry)
    }, intersectionObserverOptions)

    observerRef.observe(r)

    Solid.onCleanup(() => {
      observerRef?.disconnect()
    })
  })

  return () => observerRef
}

