import { hydrate } from 'solid-js/web'
import { RouterProvider } from '../src'
import { createAppRouter, loaderRuns } from './app.shared'
import { MATCH_KEY_PREFIX } from '../src/registryTransfer'

declare global {
  interface Window {
    __REPRO_RESULTS?: Record<string, unknown>
    __REPRO_DONE?: boolean
  }
}

const results: Record<string, unknown> = {}
window.__REPRO_RESULTS = results

const consoleErrors: Array<string> = []
const origError = console.error
console.error = (...args: Array<unknown>) => {
  consoleErrors.push(args.map(String).join(' '))
  origError(...args)
}
const consoleWarnings: Array<string> = []
const origWarn = console.warn
console.warn = (...args: Array<unknown>) => {
  consoleWarnings.push(args.map(String).join(' '))
  origWarn(...args)
}
window.addEventListener('error', (e) => {
  consoleErrors.push(`window.onerror: ${e.message}`)
})
window.addEventListener('unhandledrejection', (e) => {
  consoleErrors.push(`unhandledrejection: ${e.reason}`)
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const root = document.getElementById('root')!
  const serverNode = document.getElementById('home')

  // The registry entries the server's RouterProvider wrote, populated at
  // document parse — createRouter's boot consumes (and deletes) them, so
  // sample before construction.
  const hasMatchEntries = () =>
    Object.keys((window as any)._$HY?.r ?? {}).some((key) =>
      key.startsWith(MATCH_KEY_PREFIX),
    )
  results.registryHadMatchEntries = hasMatchEntries()

  const { router, resolveAboutChunk } = createAppRouter()
  results.loaderRunsBeforeHydrate = loaderRuns.count
  // Phase 1 boot happened at router creation: entries consumed, matches
  // committed, zero loader runs — nothing left for the app to wire.
  results.registryPrimed =
    results.registryHadMatchEntries &&
    !hasMatchEntries() &&
    router.stores.matches.get().length > 0

  results.htmlBeforeHydrate = root.innerHTML
  hydrate(() => <RouterProvider router={router} />, root)
  await sleep(50)
  results.loaderRunsAfterHydrate = loaderRuns.count
  results.loaderDataVisible = (
    document.getElementById('home')?.textContent ?? ''
  ).includes('loader-data-run-1')
  // Deferred (unawaited) loaderData field: server streamed its resolution,
  // client <Await> must consume the transferred promise — same run number,
  // no fallback left in the DOM.
  results.deferredDataVisible =
    document.getElementById('deferred')?.textContent === 'deferred-data-run-1'
  results.deferredFallbackGone = !document.getElementById('deferred-fallback')

  // -- Phase 1: hydration itself --
  results.htmlAfterHydrate = root.innerHTML
  results.hydrationErrors = consoleErrors.slice()
  results.homeVisibleAfterHydrate = !!document.getElementById('home')
  results.pendingFlashDuringHydrate = !!document.getElementById('pending')
  // DOM identity: hydration must claim the server-rendered node, not replace it.
  results.serverNodeReused = serverNode
    ? serverNode === document.getElementById('home')
    : 'no-server-node'

  // -- Phase 2: post-hydration navigation with an unresolved chunk --
  const navDone = router.navigate({ to: '/about' })
  await sleep(100)
  results.pendingVisibleDuringNav = !!document.getElementById('pending')
  results.domDuringNav = root.innerHTML

  // -- Phase 3: chunk resolves, content appears --
  resolveAboutChunk({
    default: () => <section id="about">About content</section>,
  })
  await navDone.catch(() => {})
  await sleep(100)
  results.aboutVisibleAfterResolve = !!document.getElementById('about')
  results.pendingGoneAfterResolve = !document.getElementById('pending')
  results.allConsoleErrors = consoleErrors.slice()
  results.allConsoleWarnings = consoleWarnings.slice()

  window.__REPRO_DONE = true
}

main().catch((err) => {
  results.fatal = String(
    err && (err as Error).stack ? (err as Error).stack : err,
  )
  window.__REPRO_DONE = true
})
