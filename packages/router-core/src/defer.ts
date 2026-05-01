import { defaultSerializeError } from './router'
import type { AnyRoute } from './route'
import type { AnyRouteMatch } from './Matches'
import type { RouterCore } from './router'

/**
 * Well-known symbol used by {@link defer} to tag a promise with
 * its deferred state. Consumers can read `promise[TSR_DEFERRED_PROMISE]`
 * to access `status`, `data`, or `error`.
 */
export const TSR_DEFERRED_PROMISE = Symbol.for('TSR_DEFERRED_PROMISE')

export type DeferredPromiseState<T> =
  | {
      status: 'pending'
      data?: T
      error?: unknown
    }
  | {
      status: 'success'
      data: T
    }
  | {
      status: 'error'
      data?: T
      error: unknown
    }

/**
 * Resolve promises in a deferrable descriptor array — the four `head()`
 * fields (`meta`, `links`, `scripts`, `styles`) and body `scripts` from
 * `route.options.scripts`. Entries may be plain descriptors or promises
 * resolving to descriptors, useful when a tag depends on a deferred loader
 * value.
 *
 * On SSR for crawlers (`serverSsr.isBot` true), promises are awaited so the
 * tags land in the initial HTML. Otherwise promises are skipped here and
 * surface later via a client re-evaluation pass.
 *
 * @param awaitClient Forces awaiting on the client. Used by the re-eval
 * pass and hydration, where the originals have already settled.
 * @internal Exported only for unit tests. Internal callers should use
 * {@link processAllDeferredFields}.
 */
export async function processDeferredField(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  arr: Array<unknown> | unknown,
  field: string,
  awaitClient?: boolean,
): Promise<Array<unknown> | undefined> {
  if (!Array.isArray(arr)) return undefined
  if (!arrayHasPromise(arr)) return arr

  const shouldAwait = router.serverSsr
    ? router.serverSsr.isBot
    : !!awaitClient

  const result: Array<unknown> = []

  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i]
    if (!(entry instanceof Promise)) {
      result.push(entry)
      continue
    }

    const id = matchId + '|' + field + '|' + i
    const resolved$ = Promise.resolve(entry)

    if (shouldAwait) {
      try {
        const resolved = await resolved$
        pushResolved(result, resolved)
      } catch (err) {
        console.error(
          `Deferred ${field} promise rejected for "${id}":`,
          err,
        )
      }
    } else {
      // Skip: the caller schedules a re-eval once the original settles.
      // The catch silences unhandled-rejection warnings on what would
      // otherwise be an orphan promise.
      resolved$.catch((err) => {
        console.error(
          `Deferred ${field} promise rejected for "${id}":`,
          err,
        )
      })
    }
  }
  return result
}

function arrayHasPromise(arr: Array<unknown>): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] instanceof Promise) return true
  }
  return false
}

/**
 * Sync probe: does any field in `fields` carry a deferred Promise entry?
 *
 * Lets callers skip the deferred-resolution Promise.all and the
 * re-evaluation scheduling entirely on the (common) static-head path,
 * without paying for a full {@link processAllDeferredFields} sweep.
 */
export function hasAnyDeferred(fields: DeferrableFields | undefined): boolean {
  if (!fields) return false
  return (
    (Array.isArray(fields.meta) && arrayHasPromise(fields.meta)) ||
    (Array.isArray(fields.links) && arrayHasPromise(fields.links)) ||
    (Array.isArray(fields.headScripts) && arrayHasPromise(fields.headScripts)) ||
    (Array.isArray(fields.styles) && arrayHasPromise(fields.styles)) ||
    (Array.isArray(fields.scripts) && arrayHasPromise(fields.scripts))
  )
}

/**
 * Mirrors `processDeferredField`'s no-promise return shape: the array
 * if `v` is one, otherwise `undefined`. Used by the fast path so static
 * descriptors land on the match without a promise round-trip.
 */
export function toResolvedArray(
  v: unknown,
): Array<unknown> | undefined {
  return Array.isArray(v) ? v : undefined
}

/**
 * Shape produced by `head()` and `route.options.scripts()` once the framework
 * type augmentation in each `Matches.tsx` is applied: the four head-array
 * fields (`meta`, `links`, `headScripts`, `styles`) plus body `scripts`.
 * Each entry can be a descriptor or a `Promise` resolving to one or many.
 */
interface DeferrableFields {
  meta?: unknown
  links?: unknown
  headScripts?: unknown
  styles?: unknown
  scripts?: unknown
}

export function processAllDeferredFields(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  fields: DeferrableFields | undefined,
  awaitClient?: boolean,
): Promise<{
  meta: Array<unknown> | undefined
  links: Array<unknown> | undefined
  headScripts: Array<unknown> | undefined
  styles: Array<unknown> | undefined
  scripts: Array<unknown> | undefined
}> {
  return Promise.all([
    processDeferredField(router, matchId, fields?.meta, 'meta', awaitClient),
    processDeferredField(router, matchId, fields?.links, 'links', awaitClient),
    processDeferredField(
      router,
      matchId,
      fields?.headScripts,
      'headScripts',
      awaitClient,
    ),
    processDeferredField(
      router,
      matchId,
      fields?.styles,
      'styles',
      awaitClient,
    ),
    processDeferredField(
      router,
      matchId,
      fields?.scripts,
      'scripts',
      awaitClient,
    ),
  ]).then(([meta, links, headScripts, styles, scripts]) => ({
    meta,
    links,
    headScripts,
    styles,
    scripts,
  }))
}

/**
 * Schedule a client-side re-evaluation of `head()` and
 * `route.options.scripts()` once the pending deferred promises in `fields`
 * have settled, committing the resolved values via `router.updateMatch` so
 * `<HeadContent />` and `<Scripts />` subscribers re-render.
 *
 * The re-eval is single-shot: if the second `head()` invocation returns
 * another unresolved promise, it is awaited inline (via `awaitClient=true`)
 * and committed in the same pass. Without this bound, a `head()` that
 * produces fresh deferred promises on every call would loop forever.
 *
 * @param matchesSnapshot Hierarchy from the load that scheduled the re-eval.
 * Passed back to `head()` instead of the live store because the user may
 * have navigated away by the time the promises settle.
 * @param source "load" or "hydrate" — only used to disambiguate error logs.
 */
export function scheduleDeferredReEval(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  route: AnyRoute,
  matchesSnapshot: Array<AnyRouteMatch>,
  fields: DeferrableFields,
  source: 'load' | 'hydrate',
): void {
  const promises: Array<Promise<unknown>> = [
    ...promisesIn(fields.meta),
    ...promisesIn(fields.links),
    ...promisesIn(fields.headScripts),
    ...promisesIn(fields.styles),
    ...promisesIn(fields.scripts),
  ]
  if (promises.length === 0) return

  Promise.allSettled(promises).then(async () => {
    const freshMatch = router.getMatch(matchId)
    if (!freshMatch) return
    const freshContext = {
      ssr: router.options.ssr,
      matches: matchesSnapshot,
      match: freshMatch,
      params: freshMatch.params,
      loaderData: freshMatch.loaderData,
    }
    try {
      const [freshHead, freshScripts] = await Promise.all([
        route.options.head?.(freshContext),
        route.options.scripts?.(freshContext),
      ])
      const resolved = await processAllDeferredFields(
        router,
        matchId,
        {
          meta: freshHead?.meta,
          links: freshHead?.links,
          headScripts: freshHead?.scripts,
          styles: freshHead?.styles,
          scripts: freshScripts,
        },
        true,
      )
      if (!router.getMatch(matchId)) return
      router.updateMatch(matchId, (prev) => ({
        ...prev,
        meta: resolved.meta,
        links: resolved.links,
        headScripts: resolved.headScripts,
        styles: resolved.styles,
        scripts: resolved.scripts,
      }))
    } catch (err) {
      console.error(
        `Error re-evaluating deferred head/scripts (${source}) for "${matchId}":`,
        err,
      )
    }
  })
}

/** Return the Promise entries of `v` if it's an array, otherwise empty. */
function promisesIn(v: unknown): Array<Promise<unknown>> {
  if (!Array.isArray(v)) return []
  const out: Array<Promise<unknown>> = []
  for (let i = 0; i < v.length; i++) {
    const e = v[i]
    if (e instanceof Promise) out.push(e)
  }
  return out
}

/** Push resolved value(s) into result array, flattening arrays. */
function pushResolved(result: Array<unknown>, resolved: unknown): void {
  if (resolved == null) return
  if (Array.isArray(resolved)) {
    for (const v of resolved) {
      if (v != null) result.push(v)
    }
  } else {
    result.push(resolved)
  }
}

export type DeferredPromise<T> = Promise<T> & {
  [TSR_DEFERRED_PROMISE]: DeferredPromiseState<T>
}

/**
 * Wrap a promise with a deferred state for use with `<Await>` and `useAwaited`.
 *
 * The returned promise is augmented with internal state (status/data/error)
 * so UI can read progress or suspend until it settles.
 *
 * @param _promise The promise to wrap.
 * @param options Optional config. Provide `serializeError` to customize how
 * errors are serialized for transfer.
 * @returns The same promise with attached deferred metadata.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/deferFunction
 */
export function defer<T>(
  _promise: Promise<T>,
  options?: {
    serializeError?: typeof defaultSerializeError
  },
) {
  const promise = _promise as DeferredPromise<T>
  // this is already deferred promise
  if ((promise as any)[TSR_DEFERRED_PROMISE]) {
    return promise
  }
  promise[TSR_DEFERRED_PROMISE] = { status: 'pending' }

  promise
    .then((data) => {
      promise[TSR_DEFERRED_PROMISE].status = 'success'
      promise[TSR_DEFERRED_PROMISE].data = data
    })
    .catch((error) => {
      promise[TSR_DEFERRED_PROMISE].status = 'error'
      ;(promise[TSR_DEFERRED_PROMISE] as any).error = {
        data: (options?.serializeError ?? defaultSerializeError)(error),
        __isServerError: true,
      }
    })

  return promise
}
