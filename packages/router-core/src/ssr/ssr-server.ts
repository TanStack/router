import { crossSerializeStream, getCrossReferenceHeader } from 'seroval'
import { ReadableStreamPlugin } from 'seroval-plugins/web'
import invariant from 'tiny-invariant'
import { createControlledPromise } from '../utils'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import type { AnyRouter } from '../router'
import type { DehydratedMatch } from './ssr-client'
import type { DehydratedRouter } from './client'
import type { AnyRouteMatch } from '../Matches'
import type { Manifest } from '../manifest'
import { ShallowErrorPlugin } from './seroval-plugins'

declare module '../router' {
  interface ServerSsr {
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
  let _dehydrated = false
  const listeners: Array<() => void> = []

  router.serverSsr = {
    injectedHtml: [],
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
        return `<script class='$tsr'>${getInitialScript()}${script};if (typeof $_TSR !== 'undefined') $_TSR.c()</script>`
      })
    },
    dehydrate: async () => {
      invariant(!_dehydrated, 'router is already dehydrated!')
      const matches: Array<DehydratedMatch> =
        router.state.matches.map(getDehydratedMatch)

      const dehydratedRouter: DehydratedRouter = {
        manifest: router.ssr!.manifest,
        matches,
      }
      const lastMatchId =
        router.state.matches[router.state.matches.length - 1]?.id
      if (lastMatchId) {
        dehydratedRouter.lastMatchId = lastMatchId
      }
      dehydratedRouter.dehydratedData = await router.options.dehydrate?.()
      _dehydrated = true

      const p = createControlledPromise<string>()
      crossSerializeStream(dehydratedRouter, {
        refs: serializationRefs,
        // TODO make plugins configurable
        plugins: [ReadableStreamPlugin, ShallowErrorPlugin],
        onSerialize: (data, initial) => {
          const serialized = initial ? `${GLOBAL_TSR}["router"]=` + data : data
          router.serverSsr!.injectScript(() => serialized)
        },
        scopeId: SCOPE_ID,
        onDone: () => p.resolve(''),
        onError: (err) => p.reject(err),
      })
      // make sure the stream is kept open until the promise is resolved
      router.serverSsr!.injectHtml(() => p)
    },
    isDehydrated() {
      return _dehydrated
    },
    onRenderFinished: (listener) => listeners.push(listener),
    setRenderFinished: () => {
      listeners.forEach((l) => l())
    },
  }
}
