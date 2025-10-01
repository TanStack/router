import { crossSerializeStream, getCrossReferenceHeader } from 'seroval'
import invariant from 'tiny-invariant'
import { createControlledPromise } from '../utils'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { GLOBAL_TSR } from './constants'
import { defaultSerovalPlugins } from './serializer/seroval-plugins'
import { makeSsrSerovalPlugin } from './serializer/transformer'
import type { AnyRouter } from '../router'
import type { DehydratedMatch } from './ssr-client'
import type { DehydratedRouter } from './client'
import type { AnyRouteMatch } from '../Matches'
import type { Manifest } from '../manifest'
import type { AnySerializationAdapter } from './serializer/transformer'

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

const SCOPE_ID = 'tsr'

export function dehydrateMatch(match: AnyRouteMatch): DehydratedMatch {
  const dehydratedMatch: DehydratedMatch = {
    i: match.id,
    u: match.updatedAt,
    s: match.status,
  }

  const properties = [
    ['__beforeLoadContext', 'b'],
    ['loaderData', 'l'],
    ['error', 'e'],
    ['ssr', 'ssr'],
  ] as const

  for (const [key, shorthand] of properties) {
    if (match[key] !== undefined) {
      dehydratedMatch[shorthand] = match[key]
    }
  }
  return dehydratedMatch
}

export function attachRouterServerSsrUtils({
  router,
  manifest,
}: {
  router: AnyRouter
  manifest: Manifest | undefined
}) {
  router.ssr = {
    manifest,
  }
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
        return `<script ${router.options.ssr?.nonce ? `nonce='${router.options.ssr.nonce}'` : ''} class='$tsr'>${getInitialScript()}${script};$_TSR.c()</script>`
      })
    },
    dehydrate: async () => {
      invariant(!_dehydrated, 'router is already dehydrated!')
      let matchesToDehydrate = router.state.matches
      if (router.isShell()) {
        // In SPA mode we only want to dehydrate the root match
        matchesToDehydrate = matchesToDehydrate.slice(0, 1)
      }
      const matches = matchesToDehydrate.map(dehydrateMatch)

      const dehydratedRouter: DehydratedRouter = {
        manifest: router.ssr!.manifest,
        matches,
      }
      const lastMatchId = matchesToDehydrate[matchesToDehydrate.length - 1]?.id
      if (lastMatchId) {
        dehydratedRouter.lastMatchId = lastMatchId
      }
      dehydratedRouter.dehydratedData = await router.options.dehydrate?.()
      _dehydrated = true

      const p = createControlledPromise<string>()
      const trackPlugins = { didRun: false }
      const plugins =
        (
          router.options.serializationAdapters as
            | Array<AnySerializationAdapter>
            | undefined
        )?.map((t) => makeSsrSerovalPlugin(t, trackPlugins)) ?? []
      crossSerializeStream(dehydratedRouter, {
        refs: new Map(),
        plugins: [...plugins, ...defaultSerovalPlugins],
        onSerialize: (data, initial) => {
          let serialized = initial ? GLOBAL_TSR + '.router=' + data : data
          if (trackPlugins.didRun) {
            serialized = GLOBAL_TSR + '.p(()=>' + serialized + ')'
          }
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

export function getOrigin(request: Request) {
  const originHeader = request.headers.get('Origin')
  if (originHeader) {
    try {
      new URL(originHeader)
      return originHeader
    } catch {}
  }
  try {
    return new URL(request.url).origin
  } catch {}
  return 'http://localhost'
}
