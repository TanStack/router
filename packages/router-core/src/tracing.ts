import { isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'

/**
 * The subset of a `node:diagnostics_channel` `Channel` that tracing needs.
 */
export interface TracingSubChannel<TContext> {
  readonly hasSubscribers: boolean
  publish: (message: TContext) => void
  runStores: <T>(context: TContext, fn: () => T) => T
}

/**
 * The subset of a `node:diagnostics_channel` `TracingChannel` that tracing
 * needs, so router-core does not depend on `@types/node`.
 */
export interface TracingChannel<TContext> {
  // Bun's `TracingChannel` has no aggregate `hasSubscribers`.
  readonly hasSubscribers: boolean | undefined
  readonly start: TracingSubChannel<TContext>
  readonly end: TracingSubChannel<TContext>
  readonly asyncStart: TracingSubChannel<TContext>
  readonly asyncEnd: TracingSubChannel<TContext>
  readonly error: TracingSubChannel<TContext>
}

/**
 * Context published on `@tanstack/router:loader` for each server-side
 * `beforeLoad` and `loader` call.
 */
export interface LoaderTraceContext {
  type: 'beforeLoad' | 'loader'
  routeId: string
  match: AnyRouteMatch
  result?: unknown
  error?: unknown
}

interface DiagnosticsChannel {
  tracingChannel: <TContext>(name: string) => TracingChannel<TContext>
}

/**
 * Loads `node:diagnostics_channel` without a static import, so browser and
 * edge bundles resolve nothing and tracing is a no-op there.
 */
function getDiagnosticsChannel(): DiagnosticsChannel | undefined {
  try {
    const processRef = (
      globalThis as {
        process?: { getBuiltinModule?: (id: string) => unknown }
      }
    ).process

    return processRef?.getBuiltinModule?.('node:diagnostics_channel') as
      | DiagnosticsChannel
      | undefined
  } catch {
    return undefined
  }
}

const dc = getDiagnosticsChannel()

/**
 * Returns the named tracing channel, or `undefined` when the runtime has no
 * `node:diagnostics_channel`.
 */
export function createTracingChannel<TContext>(
  name: string,
): TracingChannel<TContext> | undefined {
  return dc?.tracingChannel<TContext>(name)
}

/**
 * Whether anyone listens on `channel`. Falls back to the sub-channels where
 * the aggregate `hasSubscribers` getter is missing.
 */
function shouldTrace<TContext>(
  channel: TracingChannel<TContext> | undefined,
): channel is TracingChannel<TContext> {
  if (!channel) {
    return false
  }
  const hasSubscribers = channel.hasSubscribers
  if (hasSubscribers !== undefined) {
    return hasSubscribers
  }

  return (
    channel.start.hasSubscribers ||
    channel.end.hasSubscribers ||
    channel.asyncStart.hasSubscribers ||
    channel.asyncEnd.hasSubscribers ||
    channel.error.hasSubscribers
  )
}

/**
 * Runs `fn` as a traced operation, like `TracingChannel#tracePromise` but for
 * sync and async results alike. Without subscribers, or when `getContext`
 * returns `undefined`, `fn` runs untraced and no context is built. A returned
 * promise is passed through as is, so callers can still compare it by
 * identity. Values matching `isControlFlow`, such as redirects, settle as
 * results instead of errors.
 */
export function maybeTraceOperation<
  TResult,
  TContext extends { result?: unknown; error?: unknown },
>(
  channel: TracingChannel<TContext> | undefined,
  getContext: () => TContext | undefined,
  fn: () => TResult,
  isControlFlow?: (value: unknown) => boolean,
): TResult {
  if (!shouldTrace(channel)) {
    return fn()
  }
  const context = getContext()
  if (!context) {
    return fn()
  }

  const settle = (error: unknown) => {
    if (isControlFlow?.(error)) {
      context.result = error
    } else {
      context.error = error
      channel.error.publish(context)
    }
  }

  return channel.start.runStores(context, () => {
    let result: TResult
    try {
      result = fn()
    } catch (error) {
      settle(error)
      channel.end.publish(context)
      throw error
    }
    if (!isPromise(result)) {
      context.result = result
      channel.end.publish(context)

      return result
    }

    channel.end.publish(context)
    result.then(
      (value) => {
        context.result = value
        channel.asyncStart.publish(context)
        channel.asyncEnd.publish(context)
      },
      (error: unknown) => {
        settle(error)
        channel.asyncStart.publish(context)
        channel.asyncEnd.publish(context)
      },
    )

    return result
  })
}

/**
 * Traces server-side route `beforeLoad` and `loader` calls.
 */
export const loaderChannel = createTracingChannel<LoaderTraceContext>(
  '@tanstack/router:loader',
)
