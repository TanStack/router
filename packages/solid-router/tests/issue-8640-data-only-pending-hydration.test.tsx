import { dirname, join } from 'node:path'
import { createServer } from 'vite'
import solid from 'vite-plugin-solid'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Plugin, ViteDevServer } from 'vite'
import type { HydrationCase } from './issue-8640/routeTree'

// Solid hydration needs the app compiled twice: `generate: 'ssr'` for the
// server render and `generate: 'dom', hydratable: true` for the client. Neither
// unit-test suite compiles hydratable client code, so both sides of this test
// run through their own Vite module graphs (the test's jsdom globals serve as
// the browser).
const testsDir = dirname(new URL(import.meta.url).pathname)
const packageRoot = dirname(testsDir)
const fixture = (file: string) => join(testsDir, 'issue-8640', file)

async function createSsrServer() {
  return createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [solid({ ssr: true, hot: false })],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    ssr: {
      noExternal: [/solid-js/, /@solidjs\//, /@tanstack\//],
      resolve: {
        conditions: ['node', 'module', 'development|production'],
        externalConditions: ['node'],
      },
    },
  })
}

/** Loads modules with browser resolution and hydratable DOM compilation. */
async function createClientServer() {
  const base = solid({ ssr: true, hot: false })
  const transform = base.transform as Extract<
    NonNullable<Plugin['transform']>,
    (...args: Array<any>) => any
  >
  // Compile SSR-loaded modules as hydratable client code.
  const hydratableDom: Plugin = {
    ...base,
    transform(source, id, options) {
      return transform.call(this, source, id, {
        ...options!,
        ssr: false,
      })
    },
  }
  return createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [hydratableDom],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    ssr: {
      noExternal: [/solid-js/, /@solidjs\//, /@tanstack\//, /seroval/],
      resolve: {
        conditions: ['browser', 'module', 'development|production'],
        externalConditions: ['browser'],
      },
    },
  })
}

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()!()
  }
  vi.restoreAllMocks()
  delete window.$_TSR
  for (const { name } of [...document.documentElement.attributes]) {
    document.documentElement.removeAttribute(name)
  }
  document.documentElement.innerHTML = '<head></head><body></body>'
  window.history.replaceState(null, '', '/')
})

async function loadServerDocument(entry: HydrationCase) {
  let html: string
  const server = await createSsrServer()
  try {
    const serverEntry = await server.ssrLoadModule(fixture('server-entry.tsx'))
    html = await serverEntry.renderDocument(entry)
  } finally {
    await server.close()
  }
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  // The SSR bootstrap scripts run, then remove themselves, before the client
  // entry hydrates.
  const currentScript = vi.spyOn(document, 'currentScript', 'get')
  for (const script of serverDocument.querySelectorAll('script')) {
    currentScript.mockReturnValue(script)
    new Function(script.textContent ?? '')()
    script.remove()
  }
  currentScript.mockRestore()
  window.history.replaceState(null, '', entry.path)
  // The root route renders `<html>`, so its hydration key must carry over too.
  for (const { name, value } of serverDocument.documentElement.attributes) {
    document.documentElement.setAttribute(name, value)
  }
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

const hydrationCases: Array<HydrationCase> = [
  {
    name: 'data-only success',
    ssr: 'data-only',
    path: '/dashboard',
    payload: ['success', 'success'],
    result: 'dashboard data',
  },
  {
    name: 'ssr: false success',
    ssr: false,
    path: '/dashboard',
    payload: ['success', 'pending'],
    result: 'dashboard data',
  },
  {
    name: 'data-only loader error',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'error',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'data-only loader notFound',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'notFound',
    payload: ['success', 'notFound'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only unmatched URL',
    ssr: 'data-only',
    path: '/dashboard/missing',
    payload: ['success', 'success+g'],
    result: 'dashboard not found',
  },
  {
    name: 'ssr: false invalid search',
    ssr: false,
    path: '/dashboard?invalid=1',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'ssr: false unmatched URL',
    ssr: false,
    path: '/dashboard/missing',
    payload: ['success', 'pending+g'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only child loader error',
    ssr: 'data-only',
    path: '/dashboard/child',
    payload: ['success', 'success', 'error'],
    result: 'dashboard datachild error',
  },
]

describe('a no-SSR boundary keeps its server-rendered pending component through hydration (#8640)', () => {
  test.each(hydrationCases)('$name', async (entry) => {
    await loadServerDocument(entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
    expect(serverSkeleton).not.toBeNull()
    expect(document.body).not.toHaveTextContent(entry.result)

    // Every skeleton node that ever enters the document.
    const skeletons = new Set<Element>([serverSkeleton!])
    let skeletonRemovedAt: number | undefined
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll('[data-testid="skeleton"]')
        .forEach((node) => skeletons.add(node))
      if (!serverSkeleton!.isConnected) {
        skeletonRemovedAt ??= performance.now()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    cleanups.push(() => observer.disconnect())

    // Solid reports hydration mismatches through the console.
    const hydrationErrors: Array<string> = []
    const recordHydrationError = (...args: Array<unknown>) => {
      const message = args.map(String).join(' ')
      if (/hydrat/i.test(message)) {
        hydrationErrors.push(message)
      }
    }
    vi.spyOn(console, 'error').mockImplementation(recordHydrationError)
    vi.spyOn(console, 'warn').mockImplementation(recordHydrationError)
    const client: ViteDevServer = await createClientServer()
    cleanups.push(() => client.close())
    const clientEntry = await client.ssrLoadModule(fixture('client-entry.tsx'))
    const hydrationStart = performance.now()
    const { router, dispose } = await clientEntry.hydrateDocument(entry)
    cleanups.push(async () => {
      dispose()
      await new Promise((resolve) => setTimeout(resolve, 20))
      router.history.destroy()
    })

    await vi.waitFor(
      () => expect(document.body).toHaveTextContent(entry.result),
      { timeout: 2000 },
    )

    expect(hydrationErrors).toEqual([])
    // Hydration adopts the server's pending UI and holds it for
    // `pendingMinMs`. Solid may not report a mismatch, so also check when the
    // server HTML was replaced.
    expect(skeletonRemovedAt! - hydrationStart).toBeGreaterThanOrEqual(150)
    // The hydrated server skeleton is the only one: it must not be hidden or
    // replaced by a second copy.
    expect([...skeletons]).toEqual([serverSkeleton])
    expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
  })
})
