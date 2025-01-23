import {
  TSR_DEFERRED_PROMISE,
  defer,
  isPlainArray,
  isPlainObject,
  pick,
} from '@tanstack/react-router'
import jsesc from 'jsesc'
import type {
  AnyRouteMatch,
  AnyRouter,
  ClientExtractedBaseEntry,
  DeferredPromise,
  TSRGlobalMatch,
} from '@tanstack/react-router'
import type { ResolvePromiseState } from './tsrScript'

export interface ServerExtractedBaseEntry extends ClientExtractedBaseEntry {
  dataType: '__beforeLoadContext' | 'loaderData'
  id: number
  matchIndex: number
}

export interface ServerExtractedStream extends ServerExtractedBaseEntry {
  type: 'stream'
  stream: ReadableStream
}

export type ServerExtractedEntry =
  | ServerExtractedStream
  | ServerExtractedPromise
export interface ServerExtractedPromise extends ServerExtractedBaseEntry {
  type: 'promise'
  promise: DeferredPromise<any>
}

export function serializeLoaderData(
  dataType: '__beforeLoadContext' | 'loaderData',
  data: any,
  ctx: {
    match: AnyRouteMatch
    router: AnyRouter
  },
) {
  if (!ctx.router.isServer) {
    return data
  }

  ;(ctx.match as any).extracted = (ctx.match as any).extracted || []

  const extracted = (ctx.match as any).extracted

  const replacedLoaderData = replaceBy(data, (value, path) => {
    const type =
      value instanceof ReadableStream
        ? 'stream'
        : value instanceof Promise
          ? 'promise'
          : undefined

    // If it's a stream, we need to tee it so we can read it multiple times
    if (type === 'stream') {
      const [copy1, copy2] = value.tee()
      const entry: ServerExtractedStream = {
        dataType,
        type,
        path,
        id: extracted.length,
        matchIndex: ctx.match.index,
        stream: copy2,
      }

      extracted.push(entry)
      return copy1
    } else if (type === 'promise') {
      const deferredPromise = defer(value)
      const entry: ServerExtractedPromise = {
        dataType,
        type,
        path,
        id: extracted.length,
        matchIndex: ctx.match.index,
        promise: deferredPromise,
      }
      extracted.push(entry)
    }

    return value
  })

  return replacedLoaderData
}

// Right after hydration and before the first render, we need to rehydrate each match
// This includes rehydrating the loaderData and also using the beforeLoadContext
// to reconstruct any context that was serialized on the server
export function afterHydrate({ router }: { router: AnyRouter }) {
  router.state.matches.forEach((match) => {
    const route = router.looseRoutesById[match.routeId]!
    const dMatch = window.__TSR__?.matches[match.index]
    if (dMatch) {
      const parentMatch = router.state.matches[match.index - 1]
      const parentContext = parentMatch?.context ?? router.options.context ?? {}
      if (dMatch.__beforeLoadContext) {
        match.__beforeLoadContext = router.options.transformer.parse(
          dMatch.__beforeLoadContext,
        ) as any

        match.context = {
          ...parentContext,
          ...match.context,
          ...match.__beforeLoadContext,
        }
      }

      if (dMatch.loaderData) {
        match.loaderData = router.options.transformer.parse(dMatch.loaderData)
      }

      const extracted = dMatch.extracted

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (extracted) {
        Object.entries(extracted).forEach(([_, ex]: any) => {
          deepMutableSetByPath(match, ['loaderData', ...ex.path], ex.value)
        })
      }
    }

    const headFnContent = route.options.head?.({
      matches: router.state.matches,
      match,
      params: match.params,
      loaderData: match.loaderData,
    })

    Object.assign(match, {
      meta: headFnContent?.meta,
      links: headFnContent?.links,
      scripts: headFnContent?.scripts,
    })
  })
}

export function onMatchSettled(opts: {
  router: AnyRouter
  match: AnyRouteMatch
}) {
  const { router, match } = opts

  if (!router.isServer) {
    return null
  }

  const extracted = (match as any).extracted as
    | undefined
    | Array<ServerExtractedEntry>

  const [serializedBeforeLoadData, serializedLoaderData] = (
    ['__beforeLoadContext', 'loaderData'] as const
  ).map((dataType) => {
    return extracted
      ? extracted.reduce(
          (acc: any, entry: ServerExtractedEntry) => {
            if (entry.dataType !== dataType) {
              return deepImmutableSetByPath(
                acc,
                ['temp', ...entry.path],
                undefined,
              )
            }
            return acc
          },
          { temp: match[dataType] },
        ).temp
      : match[dataType]
  })

  if (
    serializedBeforeLoadData !== undefined ||
    serializedLoaderData !== undefined ||
    extracted?.length
  ) {
    const initCode = `__TSR__.initMatch(${jsesc(
      {
        index: match.index,
        __beforeLoadContext: router.options.transformer.stringify(
          serializedBeforeLoadData,
        ),
        loaderData: router.options.transformer.stringify(serializedLoaderData),
        extracted: extracted
          ? Object.fromEntries(
              extracted.map((entry) => {
                return [entry.id, pick(entry, ['type', 'path'])]
              }),
            )
          : {},
      } satisfies TSRGlobalMatch,
      {
        isScriptContext: true,
        wrap: true,
        json: true,
      },
    )})`

    router.injectScript(() => initCode)

    if (extracted) {
      extracted.forEach((entry) => {
        if (entry.type === 'promise') return injectPromise(entry)
        return injectStream(entry)
      })
    }

    function injectPromise(entry: ServerExtractedPromise) {
      entry.promise.then(() => {
        const code = `__TSR__.resolvePromise(${jsesc(
          {
            id: entry.id,
            matchIndex: entry.matchIndex,
            promiseState: entry.promise[TSR_DEFERRED_PROMISE],
          } satisfies ResolvePromiseState,
          {
            isScriptContext: true,
            wrap: true,
            json: true,
          },
        )})`

        router.injectScript(() => code)
      })
    }

    function injectStream(entry: ServerExtractedStream) {
      ;(async () => {
        try {
          const reader = entry.stream.getReader()
          let chunk: ReadableStreamReadResult<any> | null = null
          while (!(chunk = await reader.read()).done) {
            injectChunk(chunk.value)
          }
          // reader.releaseLock()
        } catch (err) {
          console.error('stream read error', err)
        }
      })()

      function injectChunk(chunk: string | null) {
        const code = chunk
          ? `__TSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.enqueue(new TextEncoder().encode(${jsesc(
              chunk.toString(),
              {
                isScriptContext: true,
                wrap: true,
                json: true,
              },
            )}))`
          : `__TSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.close()`

        router.injectScript(() => code)
      }
    }
  }

  return null
}

export function replaceBy<T>(
  obj: T,
  cb: (value: any, path: Array<string>) => any,
  path: Array<string> = [],
): T {
  if (isPlainArray(obj)) {
    return obj.map((value, i) => replaceBy(value, cb, [...path, `${i}`])) as any
  }

  if (isPlainObject(obj)) {
    // Do not allow objects with illegal
    const newObj: any = {}

    for (const key in obj) {
      newObj[key] = replaceBy(obj[key], cb, [...path, key])
    }

    return newObj
  }

  // // Detect classes, functions, and other non-serializable objects
  // // and return undefined. Exclude some known types that are serializable
  // if (
  //   typeof obj === 'function' ||
  //   (typeof obj === 'object' &&
  //     ![Object, Promise, ReadableStream].includes((obj as any)?.constructor))
  // ) {
  //   console.info(obj)
  //   warning(false, `Non-serializable value ☝️ found at ${path.join('.')}`)
  //   return undefined as any
  // }

  const newObj = cb(obj, path)

  if (newObj !== obj) {
    return newObj
  }

  return obj
}

function deepImmutableSetByPath<T>(obj: T, path: Array<string>, value: any): T {
  // immutable set by path retaining array and object references
  if (path.length === 0) {
    return value
  }

  const [key, ...rest] = path

  if (Array.isArray(obj)) {
    return obj.map((item, i) => {
      if (i === Number(key)) {
        return deepImmutableSetByPath(item, rest, value)
      }
      return item
    }) as T
  }

  if (isPlainObject(obj)) {
    return {
      ...obj,
      [key!]: deepImmutableSetByPath((obj as any)[key!], rest, value),
    }
  }

  return obj
}

function deepMutableSetByPath<T>(obj: T, path: Array<string>, value: any) {
  // mutable set by path retaining array and object references
  if (path.length === 1) {
    ;(obj as any)[path[0]!] = value
  }

  const [key, ...rest] = path

  if (Array.isArray(obj)) {
    deepMutableSetByPath(obj[Number(key)], rest, value)
  } else if (isPlainObject(obj)) {
    deepMutableSetByPath((obj as any)[key!], rest, value)
  }
}
