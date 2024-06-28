import * as React from 'react'
import {
  ScriptOnce,
  createControlledPromise,
  defer,
  isPlainArray,
  isPlainObject,
  pick,
  rootRouteId,
  useRouter,
} from '@tanstack/react-router'
import jsesc from 'jsesc'
import invariant from 'tiny-invariant'
import { Context } from '@tanstack/react-cross-context'
import type {
  AnyRouteMatch,
  AnyRouter,
  ControlledPromise,
} from '@tanstack/react-router'

type Entry = {
  type: 'promise' | 'stream'
  path: Array<string>
  value: any
  id: number
  streamState?: StreamState
  matchIndex: number
}

export function serializeLoaderData(
  loaderData: any,
  ctx: {
    match: AnyRouteMatch
    router: AnyRouter
  },
) {
  if (!ctx.router.isServer) {
    return loaderData
  }

  const extracted: Array<Entry> = []

  const replacedLoaderData = replaceBy(loaderData, (value, path) => {
    const type =
      value instanceof ReadableStream
        ? 'stream'
        : value instanceof Promise
          ? 'promise'
          : undefined

    if (type) {
      const entry: Entry = {
        type,
        path,
        id: extracted.length,
        value,
        matchIndex: ctx.match.index,
      }

      extracted.push(entry)

      // If it's a stream, we need to tee it so we can read it multiple times
      if (type === 'stream') {
        const [copy1, copy2] = value.tee()
        entry.streamState = createStreamState({ stream: copy2 })

        return copy1
      } else {
        defer(value)
      }
    }

    return value
  })

  ;(ctx.match as any).extracted = extracted

  return replacedLoaderData
}

export function afterHydrate({ router }: { router: AnyRouter }) {
  router.state.matches.forEach((match) => {
    match.loaderData = window.__TSR__?.matches[match.index]?.loaderData
    const extracted = window.__TSR__?.matches[match.index]?.extracted

    if (extracted) {
      Object.entries(extracted).forEach(([_, ex]: any) => {
        deepMutableSetByPath(match, ['loaderData', ...ex.path], ex.value)
      })
    }
  })
}

export function AfterEachMatch(props: { match: any; matchIndex: number }) {
  const router = useRouter()

  const dehydratedCtx = React.useContext(
    Context.get('TanStackRouterHydrationContext', {}),
  )

  const fullMatch = router.state.matches[props.matchIndex]!

  if (!router.isServer) {
    return null
  }

  const extracted = (fullMatch as any).extracted as undefined | Array<Entry>

  // Remove the extracted values from the loaderData
  const serializedLoaderData = extracted
    ? extracted.reduce(
        (acc: any, entry: Entry) => {
          return deepImmutableSetByPath(
            acc,
            ['loaderData', ...entry.path],
            undefined,
          )
        },
        { loaderData: fullMatch.loaderData },
      ).loaderData
    : fullMatch.loaderData

  return (
    <>
      {fullMatch.routeId === rootRouteId ? (
        <>
          <ScriptOnce
            log={false}
            children={`
window.__TSR__ = {
  matches: [],
  initMatch: (index) => {
    Object.entries(__TSR__.matches[index].extracted).forEach(([id, ex]) => {
      if (ex.type === 'stream') {
        let controller;
        ex.value = new ReadableStream({
          start(c) { controller = c; }
        })
        ex.value.controller = controller
      } else if (ex.type === 'promise') {
        let r, j
        ex.value = new Promise((r_, j_) => { r = r_, j = j_ })
        ex.resolve = r; ex.reject = j
      }
    })
  },
  cleanScripts: () => {
    document.querySelectorAll('.tsr-once').forEach((el) => {
      el.remove()
    })
  },
}`}
          />
          <ScriptOnce
            children={`
window.__TSR__.dehydrated = ${jsesc(
              router.options.transformer.stringify(dehydratedCtx),
              {
                isScriptContext: true,
                wrap: true,
                json: true,
              },
            )}`}
          />
        </>
      ) : null}
      {serializedLoaderData !== undefined || extracted ? (
        <ScriptOnce
          children={`__TSR__.matches[${props.matchIndex}] = ${jsesc(
            {
              loaderData: serializedLoaderData,
              extracted: extracted
                ? Object.fromEntries(
                    extracted.map((entry) => {
                      return [entry.id, pick(entry, ['type', 'path'])]
                    }),
                  )
                : {},
            },
            {
              isScriptContext: true,
              wrap: true,
              json: true,
            },
          )}; __TSR__.initMatch(${props.matchIndex})`}
        />
      ) : null}
      {extracted
        ? extracted.map((d, i) => {
            if (d.type === 'stream') {
              return <DehydrateStream key={i} entry={d} />
            }

            return <DehydratePromise key={i} entry={d} />
          })
        : null}
    </>
  )
}

export function replaceBy<T>(
  obj: T,
  cb: (value: any, path: Array<string>) => any,
  path: Array<string> = [],
): T {
  const newObj = cb(obj, path)

  if (newObj !== obj) {
    return newObj
  }

  if (isPlainArray(obj)) {
    return obj.map((value, i) => replaceBy(value, cb, [...path, `${i}`])) as any
  }

  if (isPlainObject(obj)) {
    const newObj: any = {}

    for (const key in obj) {
      newObj[key] = replaceBy(obj[key], cb, [...path, key])
    }

    return newObj
  }

  return obj
}

function DehydratePromise({ entry }: { entry: Entry }) {
  return (
    <div className="tsr-once">
      <React.Suspense fallback={null}>
        <InnerDehydratePromise entry={entry} />
      </React.Suspense>
    </div>
  )
}

function InnerDehydratePromise({ entry }: { entry: Entry }) {
  if (entry.value.status === 'pending') {
    throw entry.value
  }

  return (
    <ScriptOnce
      children={`__TSR__.matches[${entry.matchIndex}].extracted[${entry.id}].resolve(${jsesc(
        entry.value.data,
        {
          isScriptContext: true,
          wrap: true,
          json: true,
        },
      )})`}
    />
  )
}

function DehydrateStream({ entry }: { entry: Entry }) {
  invariant(entry.streamState, 'StreamState should be defined')

  return (
    <StreamChunks
      streamState={entry.streamState}
      children={(chunk) => (
        <ScriptOnce
          children={
            chunk
              ? `__TSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.enqueue(new TextEncoder().encode(${jsesc(
                  chunk.toString(),
                  {
                    isScriptContext: true,
                    wrap: true,
                    json: true,
                  },
                )}))`
              : `__TSR__.matches[${entry.matchIndex}].extracted[${entry.id}].value.controller.close()`
          }
        />
      )}
    />
  )
}

type StreamState = {
  promises: Array<ControlledPromise<string | null>>
}

// Readable stream with state is a stream that has a promise that resolves to the next chunk
function createStreamState({
  stream,
}: {
  stream: ReadableStream
}): StreamState {
  const streamState: StreamState = {
    promises: [],
  }

  const reader = stream.getReader()

  const read = (index: number): any => {
    streamState.promises[index] = createControlledPromise()

    return reader.read().then(({ done, value }) => {
      if (done) {
        streamState.promises[index]!.resolve(null)
        reader.releaseLock()
        return
      }

      streamState.promises[index]!.resolve(value)

      return read(index + 1)
    })
  }

  read(0).catch((err: any) => {
    console.error('stream read error', err)
  })

  return streamState
}

function StreamChunks({
  streamState,
  children,
  __index = 0,
}: {
  streamState: StreamState
  children: (chunk: string | null) => JSX.Element
  __index?: number
}) {
  const promise = streamState.promises[__index]

  if (!promise) {
    return null
  }

  if (promise.status === 'pending') {
    throw promise
  }

  const chunk = promise.value!

  return (
    <>
      {children(chunk)}
      <div className="tsr-once">
        <React.Suspense fallback={null}>
          <StreamChunks
            streamState={streamState}
            __index={__index + 1}
            children={children}
          />
        </React.Suspense>
      </div>
    </>
  )
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
