import { default as warning } from 'tiny-warning'
import { crossSerializeStream, getCrossReferenceHeader } from 'seroval'
import { ReadableStreamPlugin } from 'seroval-plugins/web'
import invariant from 'tiny-invariant'
import { createControlledPromise } from '../utils'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { serializeString } from './serializeString'
import type { AnyRouter } from '../router'
import type { DehydratedMatch } from './ssr-client'
import type { DehydratedRouter } from './client'
import type { AnyRouteMatch } from '../Matches'
import type { Manifest } from '../manifest'

declare module '../router' {
  interface ServerSsr {
    streamInternal: (path: Array<string>, value: unknown) => void
    setDehydated: () => void
    setRenderFinished: () => void
  }
  interface RouterEvents {
    onInjectedHtml: {
      type: 'onInjectedHtml'
      promise: Promise<string>
    }
  }
}

export const GLOBAL_TSR = '$_TSR'
// TODO make seroval scopeId configurable, as this is not necessary for React, only for Solid so it does not clash with its SSR
const SCOPE_ID = 'tsr'

export function getDehydratedMatch(match: AnyRouteMatch): DehydratedMatch {
  const terseMatch: DehydratedMatch = {
    i: match.id,
    u: match.updatedAt,
    s: match.status,
  }

  if (match.__beforeLoadContext) {
    terseMatch.b = match.__beforeLoadContext
  }
  if (match.loaderData) {
    terseMatch.l = match.loaderData
  }

  if (match.error) {
    terseMatch.e = match.error
  }

  if (match.ssr !== undefined) {
    terseMatch.ssr = match.ssr
  }
  return terseMatch
}

export function attachRouterServerSsrUtils(
  router: AnyRouter,
  manifest: Manifest | undefined,
) {
  router.ssr = {
    manifest,
  }
  const serializationRefs = new Map<unknown, number>()

  let initialScriptSent = false
  const getInitialScript = () => {
    if (initialScriptSent) {
      return ''
    }
    initialScriptSent = true
    return `${getCrossReferenceHeader(SCOPE_ID)};${minifiedTsrBootStrapScript};`
  }
  let dehydrated = false
  const listeners: Array<() => void> = []

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
    injectScript: (getScript) => {
      return router.serverSsr!.injectHtml(async () => {
        const script = await getScript()
        return `<script class='tsr-once'>${getInitialScript()}${script};if (typeof $_TSR !== 'undefined') $_TSR.c()</script>`
      })
    },
    streamValue: (key, value) => {
      warning(
        !router.serverSsr!.streamedKeys.has(key),
        'Key has already been streamed: ' + key,
      )
      router.serverSsr!.streamedKeys.add(key)
      router.serverSsr!.streamInternal(['v', key], value)
      // router.serverSsr!.valueStream.next({ key, value })
    },
    streamInternal: (path: Array<string>, value: unknown) => {
      const p = createControlledPromise<string>()
      crossSerializeStream(value, {
        refs: serializationRefs,
        // TODO make plugins configurable
        plugins: [ReadableStreamPlugin],
        onSerialize: (data, initial) => {
          let header = ''
          if (initial) {
            header =
              GLOBAL_TSR +
              path.map((x) => `["${serializeString(x)}"]`).join('') +
              '='
          }
          const serialized = initial ? header + data : data
          router.serverSsr!.injectScript(() => serialized)
        },
        scopeId: SCOPE_ID,
        onDone: () => p.resolve(''),
        onError: (err) => p.reject(err),
      })
      // make sure the stream is kept open until the promise is resolved
      router.serverSsr!.injectHtml(() => p)
    },
    setDehydated() {
      dehydrated = true
    },
    isDehydrated() {
      return dehydrated
    },
    onRenderFinished: (listener) => listeners.push(listener),
    setRenderFinished: () => {
      listeners.forEach((l) => l())
    },
  }
}

export async function dehydrateRouter(router: AnyRouter) {
  invariant(router.serverSsr!.isDehydrated, 'router is already dehydrated!')
  const matches: Array<DehydratedMatch> =
    router.state.matches.map(getDehydratedMatch)
  const dehydratedRouter: DehydratedRouter = {
    manifest: router.ssr!.manifest,
    matches,
  }
  const lastMatchId = router.state.matches[router.state.matches.length - 1]?.id
  if (lastMatchId) {
    dehydratedRouter.lastMatchId = lastMatchId
  }
  dehydratedRouter.dehydratedData = await router.options.dehydrate?.()
  router.serverSsr!.streamInternal(['r'], dehydratedRouter)
  router.serverSsr!.setDehydated()
}
