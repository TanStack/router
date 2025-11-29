import { crossSerializeStream, getCrossReferenceHeader } from 'seroval'
import invariant from 'tiny-invariant'
import { createControlledPromise } from '../utils'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { GLOBAL_TSR } from './constants'
import { defaultSerovalPlugins } from './serializer/seroval-plugins'
import { makeSsrSerovalPlugin } from './serializer/transformer'
import { TSR_SCRIPT_BARRIER_ID } from './transformStreamWithRouter'
import type { AnySerializationAdapter } from './serializer/transformer'
import type { AnyRouter } from '../router'
import type { DehydratedMatch } from './ssr-client'
import type { DehydratedRouter } from './client'
import type { AnyRouteMatch } from '../Matches'
import type { Manifest, RouterManagedTag } from '../manifest'

declare module '../router' {
  interface ServerSsr {
    setRenderFinished: () => void
    cleanup: () => void
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

const INITIAL_SCRIPTS = [
  getCrossReferenceHeader(SCOPE_ID),
  minifiedTsrBootStrapScript,
]

class ScriptBuffer {
  private router: AnyRouter | undefined
  private _queue: Array<string> = [...INITIAL_SCRIPTS]
  private _scriptBarrierLifted = false
  private _cleanedUp = false

  constructor(router: AnyRouter) {
    this.router = router
  }

  enqueue(script: string) {
    if (this._cleanedUp) return
    if (this._scriptBarrierLifted && this._queue.length === 0) {
      queueMicrotask(() => {
        this.injectBufferedScripts()
      })
    }
    this._queue.push(script)
  }

  liftBarrier() {
    if (this._scriptBarrierLifted || this._cleanedUp) return
    this._scriptBarrierLifted = true
    if (this._queue.length > 0) {
      queueMicrotask(() => {
        this.injectBufferedScripts()
      })
    }
  }

  takeAll() {
    const bufferedScripts = this._queue
    this._queue = []
    if (bufferedScripts.length === 0) {
      return undefined
    }
    bufferedScripts.push(`${GLOBAL_TSR}.c()`)
    const joinedScripts = bufferedScripts.join(';')
    return joinedScripts
  }

  injectBufferedScripts() {
    if (this._cleanedUp) return
    const scriptsToInject = this.takeAll()
    if (scriptsToInject && this.router?.serverSsr) {
      this.router.serverSsr.injectScript(() => scriptsToInject)
    }
  }

  cleanup() {
    this._cleanedUp = true
    this._queue = []
    this.router = undefined
  }
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
  let _dehydrated = false
  const listeners: Array<() => void> = []
  const scriptBuffer = new ScriptBuffer(router)

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
        if (!script) {
          return ''
        }
        return `<script${router.options.ssr?.nonce ? ` nonce='${router.options.ssr.nonce}'` : ''} class='$tsr'>${script}</script>`
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

      let manifestToDehydrate: Manifest | undefined = undefined
      // only send manifest of the current routes to the client
      if (manifest) {
        const filteredRoutes = Object.fromEntries(
          router.state.matches.map((k) => [
            k.routeId,
            manifest.routes[k.routeId],
          ]),
        )
        manifestToDehydrate = {
          routes: filteredRoutes,
        }
      }
      const dehydratedRouter: DehydratedRouter = {
        manifest: manifestToDehydrate,
        matches,
      }
      const lastMatchId = matchesToDehydrate[matchesToDehydrate.length - 1]?.id
      if (lastMatchId) {
        dehydratedRouter.lastMatchId = lastMatchId
      }
      const dehydratedData = await router.options.dehydrate?.()
      if (dehydratedData) {
        dehydratedRouter.dehydratedData = dehydratedData
      }
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
          scriptBuffer.enqueue(serialized)
        },
        scopeId: SCOPE_ID,
        onDone: () => {
          scriptBuffer.enqueue(GLOBAL_TSR + '.streamEnd=true')
          p.resolve('')
        },
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
      // Clear listeners after calling them to prevent memory leaks
      listeners.length = 0
      scriptBuffer.liftBarrier()
    },
    takeBufferedScripts() {
      const scripts = scriptBuffer.takeAll()
      const serverBufferedScript: RouterManagedTag = {
        tag: 'script',
        attrs: {
          nonce: router.options.ssr?.nonce,
          className: '$tsr',
          id: TSR_SCRIPT_BARRIER_ID,
        },
        children: scripts,
      }
      return serverBufferedScript
    },
    liftScriptBarrier() {
      scriptBuffer.liftBarrier()
    },
    cleanup() {
      // Guard against multiple cleanup calls
      if (!router.serverSsr) return
      listeners.length = 0
      scriptBuffer.cleanup()
      router.serverSsr.injectedHtml = []
      router.serverSsr = undefined
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
