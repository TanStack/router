import { default as warning } from 'tiny-warning'
import {
  TSR_DEFERRED_PROMISE,
  defer,
  isPlainArray,
  isPlainObject,
  pick,
} from '@tanstack/router-core'
import jsesc from 'jsesc'
import { startSerializer } from '@tanstack/start-client-core'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import type {
  ClientExtractedBaseEntry,
  DehydratedRouter,
  ResolvePromiseState,
  SsrMatch,
} from '@tanstack/start-client-core'
import type {
  AnyRouteMatch,
  AnyRouter,
  DeferredPromise,
  Manifest,
} from '@tanstack/router-core'

export type ServerExtractedEntry =
  | ServerExtractedStream
  | ServerExtractedPromise

export interface ServerExtractedBaseEntry extends ClientExtractedBaseEntry {
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

      return promise.then(() => {})
    },
    injectScript: (getScript, opts) => {
      return router.serverSsr!.injectHtml(async () => {
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
          `__TSR_SSR__.streamedValues['${key}'] = { value: ${jsesc(
            router.ssr!.serializer.stringify(value),
            {
              isScriptContext: true,
              wrap: true,
              json: true,
            },
          )}}`,
      )
    },
    onMatchSettled,
  }

  router.serverSsr.injectScript(() => minifiedTsrBootStrapScript, {
    logScript: false,
  })
}

export function dehydrateRouter(router: AnyRouter) {
  const dehydratedRouter: DehydratedRouter = {
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

export function extractAsyncLoaderData(
  loaderData: any,
  ctx: {
    match: AnyRouteMatch
    router: AnyRouter
  },
) {
  const extracted: Array<ServerExtractedEntry> = []

  const replaced = replaceBy(loaderData, (value, path) => {
    // If it's a stream, we need to tee it so we can read it multiple times
    if (value instanceof ReadableStream) {
      const [copy1, copy2] = value.tee()
      const entry: ServerExtractedStream = {
        type: 'stream',
        path,
        id: extracted.length,
        matchIndex: ctx.match.index,
        stream: copy2,
      }

      extracted.push(entry)
      return copy1
    } else if (value instanceof Promise) {
      const deferredPromise = defer(value)
      const entry: ServerExtractedPromise = {
        type: 'promise',
        path,
        id: extracted.length,
        matchIndex: ctx.match.index,
        promise: deferredPromise,
      }
      extracted.push(entry)
    }

    return value
  })

  return { replaced, extracted }
}

export function onMatchSettled(opts: {
  router: AnyRouter
  match: AnyRouteMatch
}) {
  const { router, match } = opts

  let extracted: Array<ServerExtractedEntry> | undefined = undefined
  let serializedLoaderData: any = undefined
  if (match.loaderData !== undefined) {
    const result = extractAsyncLoaderData(match.loaderData, {
      router,
      match,
    })
    match.loaderData = result.replaced
    extracted = result.extracted
    serializedLoaderData = extracted.reduce(
      (acc: any, entry: ServerExtractedEntry) => {
        return deepImmutableSetByPath(acc, ['temp', ...entry.path], undefined)
      },
      { temp: result.replaced },
    ).temp
  }

  const initCode = `__TSR_SSR__.initMatch(${jsesc(
    {
      id: match.id,
      __beforeLoadContext: router.ssr!.serializer.stringify(
        match.__beforeLoadContext,
      ),
      loaderData: router.ssr!.serializer.stringify(serializedLoaderData),
      error: router.ssr!.serializer.stringify(match.error),
      extracted: extracted?.map((entry) => pick(entry, ['type', 'path'])),
      updatedAt: match.updatedAt,
      status: match.status,
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
    router.serverSsr!.injectScript(async () => {
      await entry.promise

      return `__TSR_SSR__.resolvePromise(${jsesc(
        {
          matchId: match.id,
          id: entry.id,
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
    // Inject a promise that resolves when the stream is done
    // We do this to keep the stream open until we're done
    router.serverSsr!.injectHtml(async () => {
      //
      try {
        const reader = entry.stream.getReader()
        let chunk: ReadableStreamReadResult<any> | null = null
        while (!(chunk = await reader.read()).done) {
          if (chunk.value) {
            const code = `__TSR_SSR__.injectChunk(${jsesc(
              {
                matchId: match.id,
                id: entry.id,
                chunk: chunk.value,
              },
              {
                isScriptContext: true,
                wrap: true,
                json: true,
              },
            )})`

            router.serverSsr!.injectScript(() => code)
          }
        }

        router.serverSsr!.injectScript(
          () =>
            `__TSR_SSR__.closeStream(${jsesc(
              {
                matchId: match.id,
                id: entry.id,
              },
              {
                isScriptContext: true,
                wrap: true,
                json: true,
              },
            )})`,
        )
      } catch (err) {
        console.error('stream read error', err)
      }

      return ''
    })
  }
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
