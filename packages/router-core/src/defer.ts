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
 * When `shouldAwait` is true (SSR for crawlers, or the client re-eval pass)
 * promises are awaited so the resolved values land in the result. When
 * false, promises are filtered out and surface later via a client
 * re-evaluation pass.
 *
 * Returns synchronously when nothing actually went async — the input has no
 * promise entries, or `shouldAwait` is false (so the deferred entries are
 * filtered out).
 *
 * @internal Exported only for unit tests. Internal callers should use
 * {@link applyHead}.
 */
export function processDeferredArr(
  matchId: string,
  arr: Array<unknown>,
  field: string,
  shouldAwait: boolean,
): Array<unknown> | Promise<Array<unknown>> {
  for (let i = 0; i < arr.length; i++) {
    if (!(arr[i] instanceof Promise)) continue
    return shouldAwait
      ? resolveAsyncTail(matchId, arr, field, i)
      : filterPromisesSync(matchId, arr, field, i)
  }
  return arr
}

/**
 * Build a copy of `arr` with promise entries dropped. Each dropped promise
 * gets a `.catch` to silence the unhandled-rejection warning on what would
 * otherwise be an orphan — the re-eval pass picks up the next snapshot.
 */
function filterPromisesSync(
  matchId: string,
  arr: Array<unknown>,
  field: string,
  start: number,
): Array<unknown> {
  const result = arr.slice(0, start)
  for (let i = start; i < arr.length; i++) {
    const entry = arr[i]
    if (!(entry instanceof Promise)) {
      result.push(entry)
      continue
    }
    entry.catch((err) => {
      console.error(
        `Deferred ${field} promise rejected for "${matchId}|${field}|${i}":`,
        err,
      )
    })
  }
  return result
}

/**
 * Async tail: await each remaining promise, flattening resolved arrays into
 * the surrounding array via {@link pushResolved}. Rejections are logged and
 * dropped so one failed deferred doesn't poison the rest of the head.
 */
async function resolveAsyncTail(
  matchId: string,
  arr: Array<unknown>,
  field: string,
  start: number,
): Promise<Array<unknown>> {
  const result = arr.slice(0, start)
  for (let i = start; i < arr.length; i++) {
    const entry = arr[i]
    if (!(entry instanceof Promise)) {
      result.push(entry)
      continue
    }
    try {
      pushResolved(result, await entry)
    } catch (err) {
      console.error(
        `Deferred ${field} promise rejected for "${matchId}|${field}|${i}":`,
        err,
      )
    }
  }
  return result
}

/**
 * Shape produced by `head()` and `route.options.scripts()` once the framework
 * type augmentation in each `Matches.tsx` is applied: the four head-array
 * fields (`meta`, `links`, `headScripts`, `styles`) plus body `scripts`.
 * Each entry can be a descriptor or a `Promise` resolving to one or many.
 */
interface DeferrableFields {
  meta?: Array<unknown>
  links?: Array<unknown>
  headScripts?: Array<unknown>
  styles?: Array<unknown>
  scripts?: Array<unknown>
}

interface ResolvedFields {
  meta: Array<unknown> | undefined
  links: Array<unknown> | undefined
  headScripts: Array<unknown> | undefined
  styles: Array<unknown> | undefined
  scripts: Array<unknown> | undefined
}

function arrayHasPromise(arr: Array<unknown>): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] instanceof Promise) return true
  }
  return false
}

/**
 * Resolve every deferrable field. Returns synchronously when no field went
 * async — i.e. either no promises at all (static head) or all promises were
 * filtered out (`shouldAwait=false` path) — so the common path doesn't pay
 * for a `Promise.all` of five async wrappers per match. Only allocates a
 * Promise when at least one field actually awaited work.
 */
function processAllDeferredFields(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  fields: DeferrableFields,
  awaitClient?: boolean,
): ResolvedFields | Promise<ResolvedFields> {
  // Hoist once: every field would otherwise recompute the same boolean.
  const shouldAwait = router.serverSsr
    ? !!router.serverSsr.isBot
    : !!awaitClient

  const meta = fields.meta
    ? processDeferredArr(matchId, fields.meta, 'meta', shouldAwait)
    : undefined
  const links = fields.links
    ? processDeferredArr(matchId, fields.links, 'links', shouldAwait)
    : undefined
  const headScripts = fields.headScripts
    ? processDeferredArr(matchId, fields.headScripts, 'headScripts', shouldAwait)
    : undefined
  const styles = fields.styles
    ? processDeferredArr(matchId, fields.styles, 'styles', shouldAwait)
    : undefined
  const scripts = fields.scripts
    ? processDeferredArr(matchId, fields.scripts, 'scripts', shouldAwait)
    : undefined

  if (
    !(meta instanceof Promise) &&
    !(links instanceof Promise) &&
    !(headScripts instanceof Promise) &&
    !(styles instanceof Promise) &&
    !(scripts instanceof Promise)
  ) {
    return { meta, links, headScripts, styles, scripts }
  }

  return Promise.all([meta, links, headScripts, styles, scripts]).then(
    ([m, l, hs, st, sc]) => ({
      meta: m,
      links: l,
      headScripts: hs,
      styles: st,
      scripts: sc,
    }),
  )
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
 * 
 * @internal
 */
export function scheduleDeferredReEval(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  route: AnyRoute,
  matchesSnapshot: Array<AnyRouteMatch>,
  fields: DeferrableFields,
  source: 'load' | 'hydrate',
): void {
  const promises: Array<Promise<unknown>> = []
  collectPromises(promises, fields.meta)
  collectPromises(promises, fields.links)
  collectPromises(promises, fields.headScripts)
  collectPromises(promises, fields.styles)
  collectPromises(promises, fields.scripts)
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
      const headRaw = route.options.head?.(freshContext)
      const scriptsRaw = route.options.scripts?.(freshContext)
      const freshHead =
        headRaw instanceof Promise ? await headRaw : headRaw
      const freshScripts =
        scriptsRaw instanceof Promise ? await scriptsRaw : scriptsRaw

      const fields: DeferrableFields = {
        meta: asArray(freshHead?.meta),
        links: asArray(freshHead?.links),
        headScripts: asArray(freshHead?.scripts),
        styles: asArray(freshHead?.styles),
        scripts: asArray(freshScripts),
      }
      const result = processAllDeferredFields(router, matchId, fields, true)
      const resolved = result instanceof Promise ? await result : result
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

/**
 * Builds the deferrable fields from `head()` and
 * `route.options.scripts()` results, resolves them (sync or async), and on
 * the client schedules a re-evaluation when any field has deferred entries
 * so the load and hydrate paths commit deferred values the same way.
 *
 * Returns synchronously when no field carries a deferred promise (the
 * common static-head case), keeping that path allocation-free.
 *
 * @internal
 */
export function applyHead(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  route: AnyRoute,
  matches: Array<AnyRouteMatch>,
  headFnContent:
    | { meta?: unknown; links?: unknown; scripts?: unknown; styles?: unknown }
    | undefined,
  scriptsRaw: unknown,
  source: 'load' | 'hydrate',
): ResolvedFields | Promise<ResolvedFields> {
  const metaArr = asArray(headFnContent?.meta)
  const linksArr = asArray(headFnContent?.links)
  const headScriptsArr = asArray(headFnContent?.scripts)
  const stylesArr = asArray(headFnContent?.styles)
  const scriptsArr = asArray(scriptsRaw)

  // Fast path: no deferred promises in any field. Skip resolve + re-eval,
  // both no-ops here but each costs allocations per match.
  if (
    !(metaArr && arrayHasPromise(metaArr)) &&
    !(linksArr && arrayHasPromise(linksArr)) &&
    !(headScriptsArr && arrayHasPromise(headScriptsArr)) &&
    !(stylesArr && arrayHasPromise(stylesArr)) &&
    !(scriptsArr && arrayHasPromise(scriptsArr))
  ) {
    return {
      meta: metaArr,
      links: linksArr,
      headScripts: headScriptsArr,
      styles: stylesArr,
      scripts: scriptsArr,
    }
  }

  // At least one field has a deferred entry. On the client, schedule a
  // re-eval so the resolved values land via the store once the originals
  // settle (no-op on the server since the response is already in flight).
  // We schedule even when the resolve below returns synchronously: on a
  // non-bot SSR / client load the deferred entries are filtered out for
  // the initial result and only surface via this re-eval pass.
  const fields: DeferrableFields = {
    meta: metaArr,
    links: linksArr,
    headScripts: headScriptsArr,
    styles: stylesArr,
    scripts: scriptsArr,
  }
  if (!router.serverSsr) {
    scheduleDeferredReEval(router, matchId, route, matches, fields, source)
  }

  return processAllDeferredFields(router, matchId, fields)
}

function collectPromises(
  out: Array<Promise<unknown>>,
  arr: Array<unknown> | undefined,
): void {
  if (!arr) return
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]
    if (e instanceof Promise) out.push(e)
  }
}

function asArray(v: unknown): Array<unknown> | undefined {
  return Array.isArray(v) ? v : undefined
}

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
