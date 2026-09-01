import { hydrate } from 'solid-js/web'
import { RouterProvider } from '../src'
import { createAppRouter, loaderRuns } from './app.shared'
import { primeRouterFromRegistry } from './registry-transfer'

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

  const { router, resolveAboutChunk } = createAppRouter()
  results.loaderRunsBeforeHydrate = loaderRuns.count

  results.htmlBeforeHydrate = root.innerHTML
  // Phase 1 boot: NO router.load() — match synchronously, prime match state
  // from the hydration registry (populated at document parse), commit, then
  // hydrate.
  results.registryPrimed = primeRouterFromRegistry(router)
  hydrate(() => <RouterProvider router={router} />, root)
  await sleep(50)
  results.loaderRunsAfterHydrate = loaderRuns.count
  results.loaderDataVisible = (
    document.getElementById('home')?.textContent ?? ''
  ).includes('loader-data-run-1')

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
  resolveAboutChunk({ default: () => <section id="about">About content</section> })
  await navDone.catch(() => {})
  await sleep(100)
  results.aboutVisibleAfterResolve = !!document.getElementById('about')
  results.pendingGoneAfterResolve = !document.getElementById('pending')
  results.allConsoleErrors = consoleErrors.slice()
  results.allConsoleWarnings = consoleWarnings.slice()

  window.__REPRO_DONE = true
}

main().catch((err) => {
  results.fatal = String(err && (err as Error).stack ? (err as Error).stack : err)
  window.__REPRO_DONE = true
})
