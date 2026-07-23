import type { AwaitOptions } from './useAwaited'

export declare function Await<T>(
  props: AwaitOptions<T> & {
    children: (data: T) => unknown
    fallback?: unknown
  },
): void
