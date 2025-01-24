import {
  TSR_DEFERRED_PROMISE,
  createControlledPromise,
  defer,
  isPlainArray,
  isPlainObject,
  pick,
  warning,
} from '@tanstack/react-router'
import jsesc from 'jsesc'
import { startSerializer } from '@tanstack/start-client'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import type {
  ClientExtractedBaseEntry,
  DehydratedRouter,
  ResolvePromiseState,
  SsrMatch,
} from '@tanstack/start-client'
import type {
  AnyRouteMatch,
  AnyRouter,
  DeferredPromise,
  Manifest,
} from '@tanstack/react-router'

export type ServerExtractedEntry =
  | ServerExtractedStream
  | ServerExtractedPromise

export interface ServerExtractedBaseEntry extends ClientExtractedBaseEntry {
  dataType: '__beforeLoadContext' | 'loaderData'
  id: number
  matchIndex: number
}

export interface ServerExtractedStream extends ServerExtractedBaseEntry {
  type: 'stream'
  stream: ReadableStream
}

export interface ServerExtractedPromise extends ServerExtractedBaseEntry {
  type: 'promise'
  promise: DeferredPromise<any>
}

export function attachRouterServerSsrUtils(
  router: AnyRouter,
  manifest: Manifest | undefined,
) {
  router.ssr = {
    manifest,
    serializer: startSerializer,
  }

  router.serverSsr = {
    injectedHtml: [],
    streamedKeys: new Set(),
    injectHtml: (getHtml) => {
      const promise = Promise.resolve().then(getHtml)
      router.serverSsr!.injectedHtml.push(promise)
      router.emit({
        type: 'onInjectedHtml',
        promise,
      })
    },
    injectScript: (getScript, opts) => {
      router.serverSsr!.injectHtml(async () => {
        const script = await getScript()
        return `<script class='tsr-once'>${script}${
          process.env.NODE_ENV === 'development' && (opts?.logScript ?? true)
            ? `; console.info(\`Injected From Server:
${jsesc(script, { quotes: 'backtick' })}\`)`
            : ''
        }; if (typeof __TSR_SSR__ !== 'undefined') __TSR_SSR__.cleanScripts()</script>`
      })
    },
    streamValue: (key, value) => {
      warning(
        !router.serverSsr!.streamedKeys.has(key),
        'Key has already been streamed: ' + key,
      )

      router.serverSsr!.streamedKeys.add(key)
      router.serverSsr!.injectScript(
        () =>
          `__TSR_SSR__.streamedValues['${key}'] = { value: ${router.serializer?.(router.ssr!.serializer.stringify(value))}}`,
      )
    },
    reduceBeforeLoadContext: (ctx, { match }) => {
      return extractAsyncDataToMatch(
        '__beforeLoadContext',
        ctx.beforeLoadContext,
        {
          router: router,
          match,
        },
      )
    },
    onMatchSettled,
  }

  router.serverSsr!.injectScript(() => minifiedTsrBootStrapScript, {
    logScript: false,
  })
}

export function dehydrateRouter(router: AnyRouter) {
  const dehydratedRouter: DehydratedRouter = {
    state: {
      dehydratedMatches: router.state.matches.map((d) => {
        return {
          ...pick(d, ['id', 'status', 'updatedAt']),
          // If an error occurs server-side during SSRing,
          // send a small subset of the error to the client
          error: d.error
            ? router.ssr!.serializer.stringify(d.error)
            : undefined,
          // NOTE: We don't send the loader data here, because
          // there is a potential that it needs to be streamed.
          // Instead, we render it next to the route match in the HTML
          // which gives us the potential to stream it via suspense.
        }
      }),
    },
    manifest: router.ssr!.manifest,
    dehydratedData: router.options.dehydrate?.(),
  }

  router.serverSsr!.injectScript(
    () =>
      `__TSR_SSR__.dehydrated = ${jsesc(
        router.ssr!.serializer.stringify(dehydratedRouter),
        {
          isScriptContext: true,
          wrap: true,
          json: true,
        },
      )}`,
  )
}

export function extractAsyncDataToMatch(
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

export function onMatchSettled(opts: {
  router: AnyRouter
  match: AnyRouteMatch
}) {
  const { router, match } = opts

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
    const initCode = `__TSR_SSR__.initMatch(${jsesc(
      {
        index: match.index,
        __beforeLoadContext: router.ssr!.serializer.stringify(
          serializedBeforeLoadData,
        ),
        loaderData: router.ssr!.serializer.stringify(serializedLoaderData),
        extracted: extracted
          ? Object.fromEntries(
              extracted.map((entry) => {
                return [entry.id, pick(entry, ['type', 'path'])]
              }),
            )
          : {},
      } satisfies SsrMatch,
      {
        isScriptContext: true,
        wrap: true,
        json: true,
      },
    )})`

    router.serverSsr!.injectScript(() => initCode)

    if (extracted) {
      extracted.forEach((entry) => {
        if (entry.type === 'promise') return injectPromise(entry)
        return injectStream(entry)
      })
    }

    function injectPromise(entry: ServerExtractedPromise) {
      router.serverSsr!.injectHtml(async () => {
        await entry.promise

        return `__TSR_SSR__.resolvePromise(${jsesc(
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
      })
    }

    function injectStream(entry: ServerExtractedStream) {
      const controlledPromise = createControlledPromise<void>()

      // Inject a promise that resolves when the stream is done
      // We do this to keep the stream open until we're done
      router.serverSsr!.injectHtml(() => controlledPromise.then(() => ''))
      ;(async () => {
        try {
          const reader = entry.stream.getReader()
          let chunk: ReadableStreamReadResult<any> | null = null
          while (!(chunk = await reader.read()).done) {
            injectChunk(chunk.value)
          }
          controlledPromise.resolve()
        } catch (err) {
          console.error('stream read error', err)
          controlledPromise.reject(err)
        }
      })()

      function injectChunk(chunk: string | null) {
        const code = chunk
          ? `__TSR_SSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.enqueue(new TextEncoder().encode(${jsesc(
              chunk.toString(),
              {
                isScriptContext: true,
                wrap: true,
                json: true,
              },
            )}))`
          : `__TSR_SSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.close()`

        router.serverSsr!.injectScript(() => code)
      }
    }
  }

  return null
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
