import { dirname, join } from 'node:path'
import { createServer } from 'vite'
import solid from 'vite-plugin-solid'
import { afterEach, expect, test, vi } from 'vitest'
import type { Plugin, ViteDevServer } from 'vite'

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

async function loadServerDocument(path: string) {
  let html: string
  const server = await createSsrServer()
  try {
    const entry = await server.ssrLoadModule(fixture('server-entry.tsx'))
    html = await entry.renderDocument(path)
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
  window.history.replaceState(null, '', path)
  // The root route renders `<html>`, so its hydration key must carry over too.
  for (const { name, value } of serverDocument.documentElement.attributes) {
    document.documentElement.setAttribute(name, value)
  }
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

test('a data-only route keeps its server-rendered pending component through pendingMinMs (#8640)', async () => {
  await loadServerDocument('/dashboard')

  const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
  expect(serverSkeleton).not.toBeNull()
  expect(document.querySelector('[data-testid="content"]')).toBeNull()

  // Every skeleton node that ever enters the document, the most that are in
  // it at once, and whether the server one left before the content arrived.
  const skeletons = new Set<Element>([serverSkeleton!])
  let maxSimultaneousSkeletons = 1
  let serverSkeletonDetachedBeforeContent = false
  const observer = new MutationObserver(() => {
    const current = document.querySelectorAll('[data-testid="skeleton"]')
    maxSimultaneousSkeletons = Math.max(
      maxSimultaneousSkeletons,
      current.length,
    )
    current.forEach((node) => skeletons.add(node))
    if (
      !serverSkeleton!.isConnected &&
      !document.querySelector('[data-testid="content"]')
    ) {
      serverSkeletonDetachedBeforeContent = true
    }
  })
  observer.observe(document, { childList: true, subtree: true })
  cleanups.push(() => observer.disconnect())

  const consoleErrors: Array<unknown> = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrors.push(args)
  })
  const client: ViteDevServer = await createClientServer()
  cleanups.push(() => client.close())
  const entry = await client.ssrLoadModule(fixture('client-entry.tsx'))
  const { router, dispose } = await entry.hydrateDocument()
  cleanups.push(async () => {
    dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    router.history.destroy()
  })

  await vi.waitFor(
    () =>
      expect(
        document.querySelector('[data-testid="content"]'),
      ).toHaveTextContent('dashboard data'),
    { timeout: 2000 },
  )

  expect(consoleErrors).toEqual([])
  expect(maxSimultaneousSkeletons).toBe(1)
  // The hydrated server skeleton is the only one, and it stays mounted until
  // the route content replaces it.
  expect([...skeletons]).toEqual([serverSkeleton])
  expect(serverSkeletonDetachedBeforeContent).toBe(false)
  expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
})
