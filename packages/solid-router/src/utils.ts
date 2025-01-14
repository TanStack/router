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

/** Call a JSX.EventHandlerUnion with the event. */
export function callHandler<T, TEvent extends Event>(
  event: TEvent & { currentTarget: T; target: Element },
  handler: Solid.JSX.EventHandlerUnion<T, TEvent> | undefined,
) {
  if (handler) {
    if (typeof handler === 'function') {
      handler(event)
    } else {
      handler[0](handler[1], event)
    }
  }

  return event.defaultPrevented
}

/** Create a new event handler which calls all given handlers in the order they were chained with the same event. */
export function composeEventHandlers<T>(
  handlers: Array<Solid.JSX.EventHandlerUnion<T, any> | undefined>,
) {
  return (event: any) => {
    for (const handler of handlers) {
      callHandler(event, handler)
    }
  }
}
