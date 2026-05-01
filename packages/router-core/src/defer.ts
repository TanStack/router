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

/**
 * Resolve the deferred entries inside a route's `head()` and `scripts()` output
 * for a single match.
 *
 * Returns the synchronous entries immediately. On the server the result is
 * awaited only for bots; otherwise deferred promises are filtered out of the
 * initial response and a re-evaluation pass is scheduled to update the match
 * once they settle.
 */
export function resolveDeferredHead(
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

  // Fast path: skip resolve + re-eval. Each is a no-op when no field has a
  // deferred entry, but they still allocate per match.
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

  // On non-bot SSR / client loads the deferred entries are filtered out of the
  // initial result and only surface via the client-side re-eval pass. Server
  // skips: the response is already in flight.
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

// Returns sync when no field actually went async, so the common path skips the
// Promise.all over five wrappers per match.
function processAllDeferredFields(
  router: RouterCore<any, any, any, any>,
  matchId: string,
  fields: DeferrableFields,
  awaitClient?: boolean,
): ResolvedFields | Promise<ResolvedFields> {
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

// Single-shot: any deferred promise produced by the second `head()` call is
// awaited inline (awaitClient=true) instead of scheduling another pass, so a
// `head()` that returns fresh promises on every call can't loop forever.
function scheduleDeferredReEval(
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

function processDeferredArr(
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
    // .catch silences the unhandled-rejection warning on entries we drop here;
    // the re-eval pass picks up the resolved value from the next snapshot.
    entry.catch((err) => {
      console.error(
        `Deferred ${field} promise rejected for "${matchId}|${field}|${i}":`,
        err,
      )
    })
  }
  return result
}

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
      // Drop the entry on rejection so one bad deferred doesn't poison the rest of the head.
      console.error(
        `Deferred ${field} promise rejected for "${matchId}|${field}|${i}":`,
        err,
      )
    }
  }
  return result
}

function arrayHasPromise(arr: Array<unknown>): boolean {
  for (const e of arr) {
    if (e instanceof Promise) return true
  }
  return false
}

function collectPromises(
  out: Array<Promise<unknown>>,
  arr: Array<unknown> | undefined,
): void {
  if (!arr) return
  for (const e of arr) {
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
