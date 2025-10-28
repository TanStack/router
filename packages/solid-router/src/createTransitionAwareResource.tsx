import * as Solid from 'solid-js'
import { useRouter } from './useRouter'

/**
 * Hook to check if the router is currently transitioning.
 * Returns true during navigation transitions, allowing you to show
 * custom UI or disable interactions during navigation.
 *
 * @example
 * ```tsx
 * const isTransitioning = useIsTransitioning()
 *
 * return (
 *   <button disabled={isTransitioning()}>Submit</button>
 * )
 * ```
 */
export function useIsTransitioning(): Solid.Accessor<boolean> {
  const router = useRouter()
  return () => router.isTransitioning?.() ?? false
}

/**
 * Creates a resource that respects router transitions.
 *
 * Unlike regular `createResource`, this will show cached values during
 * router transitions instead of suspending. This provides a smoother
 * user experience during navigation.
 *
 * Works with regular `Suspense` boundaries - no custom components needed!
 *
 * @example
 * ```tsx
 * const [data] = createTransitionAwareResource(
 *   () => searchParams().id,
 *   fetchData
 * )
 *
 * return (
 *   <Suspense fallback="Loading...">
 *     <div>{data()}</div>
 *   </Suspense>
 * )
 * ```
 */
export function createTransitionAwareResource<TSource, TData>(
  source: Solid.ResourceSource<TSource>,
  fetcher: Solid.ResourceFetcher<TSource, TData>,
  options?: Solid.ResourceOptions<TData>,
): Solid.ResourceReturn<TData> {
  const router = useRouter()

  const [resource, { mutate, refetch }] = Solid.createResource(source, fetcher, options)

  // Create a wrapped accessor that uses `latest` during transitions
  // This prevents Suspense from triggering during navigation
  const transitionAwareAccessor: Solid.Resource<TData> = (() => {
    const transitioning = router.isTransitioning?.() ?? false
    const loading = resource.loading
    const latest = resource.latest

    // During transitions, if we're loading and have a latest value, use it
    // This prevents Suspense from showing fallback during navigation
    if (transitioning && loading && latest !== undefined) {
      return latest as TData
    }

    // Otherwise, call the resource normally (may suspend)
    return resource()
  }) as Solid.Resource<TData>

  // Copy over resource properties
  Object.defineProperty(transitionAwareAccessor, 'state', {
    get: () => resource.state,
  })
  Object.defineProperty(transitionAwareAccessor, 'loading', {
    get: () => resource.loading,
  })
  Object.defineProperty(transitionAwareAccessor, 'error', {
    get: () => resource.error,
  })
  Object.defineProperty(transitionAwareAccessor, 'latest', {
    get: () => resource.latest,
  })

  return [transitionAwareAccessor, { mutate, refetch }]
}
