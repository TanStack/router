/**
 * Real hydration of `<Hydrate>` pages: an app built with Start's own Vite
 * plugin (`buildStart`: the Start compiler, its Hydrate plugin and the real
 * `@tanstack/react-start`, in a development build, so React reports every
 * hydration mismatch) renders each fixture module to HTML in its SSR build
 * (Node, `react-dom/server`), and a page of headless Chromium hydrates that
 * HTML with the client build (`react-dom/client` `hydrateRoot`), recording
 * React's recoverable errors and `console.error` output. A test script then
 * runs in the page (e.g. clicks a child) and its result is returned with the
 * page's markup and the scripts the page requested after it loaded.
 *
 * Thin glue only: the compiler, bundler, React, router and Start runtime are
 * the real ones; the harness writes the entries, moves the server's HTML
 * into the page and waits until the page is quiet.
 */
import { buildStart, callByIdExports, callByIdPrelude } from '../build-harness'
import type { StartBuild } from '../build-harness'

export interface PageFixture {
  /** The fixture module (`src/fixtures/<name>.tsx`). */
  code: string
}

/**
 * JavaScript of a page script: waits until the page requested no new
 * resource and changed no markup for `quiet` ms (default 150), and no
 * boundary with the `idle()` strategy whose ancestors hydrated still waits
 * to hydrate (Start marks a waiting boundary with `data-ts-hydrate-when`;
 * boundaries hydrate parent-first), at most `timeout` ms
 * (default 10 000).
 */
const settledSource = `async (quiet = 150, timeout = 10000) => {
  const start = performance.now()
  let last = ''
  let since = performance.now()
  while (performance.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const state = performance.getEntriesByType('resource').length + ':' + document.body.innerHTML
    if (state !== last) {
      last = state
      since = performance.now()
    } else if (
      performance.now() - since >= quiet &&
      ![...document.querySelectorAll('[data-ts-hydrate-when="idle"]')].some(
        (element) => !element.parentElement?.closest('[data-ts-hydrate-when]'),
      )
    ) {
      return
    }
  }
  throw new Error('the page did not settle: ' + document.body.innerHTML)
}`

/**
 * JavaScript of a page script: polls `condition` until it returns a truthy
 * value (which it resolves to), at most `timeout` ms (default 5 000).
 */
const waitForSource = `async (condition, timeout = 5000) => {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    const value = await condition()
    if (value) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('timed out waiting for ' + condition + ': ' + document.body.innerHTML)
}`

export interface Hydrated {
  /** The HTML the SSR build rendered (`''` when the page mounted). */
  serverHtml: string
  /** What `serverScript` returned after the server render. */
  serverResult: unknown
  /** Markup of the page root after hydration and the script. */
  html: string
  /**
   * Every markup the root had, in order, from before hydration (or the
   * mount) until the script ran.
   */
  snapshots: Array<string>
  /** Errors React reported through `onRecoverableError`. */
  recoverableErrors: Array<string>
  /** `console.error` output of the page (React's hydration warnings). */
  consoleErrors: Array<string>
  /** Scripts the page requested after the server HTML was in place. */
  requested: Array<string>
  /** What the script returned. */
  result: unknown
}

export interface HydrateOptions {
  /**
   * What to render: a JavaScript expression with the fixture module as `m`,
   * React's `createElement` as `h` and `props` in scope (default
   * `h(m.Page, props)`).
   */
  render?: string
  /** JSON props of the default render. */
  props?: Record<string, unknown>
  /**
   * Body of an async function run in the page once it hydrated and settled,
   * with `root` (the hydrated element), `settled()`, `waitFor(condition)`
   * and `requested()` (the scripts requested so far) in scope; its JSON
   * result is returned.
   */
  script?: string
  /**
   * Body of an async function run in the page after the server HTML is in
   * place and before hydration starts (e.g. counters the fixture reads).
   */
  beforeHydration?: string
  /**
   * A JavaScript expression evaluated in the SSR run after the server
   * render (`entry` in scope); its JSON value is `serverResult`.
   */
  serverScript?: string
  /**
   * `mount`: no server render; the page mounts the element into an empty
   * root with `createRoot` (like a boundary that first appears after the
   * app started, e.g. after a client-side navigation). Default `hydrate`.
   */
  mode?: 'hydrate' | 'mount'
}

export interface HydrationApp {
  build: StartBuild
  /** Renders fixture `name` on the server and hydrates it in a page. */
  hydrate: (name: string, options?: HydrateOptions) => Promise<Hydrated>
  /** Renders fixture `name` with the SSR build only. */
  renderServer: (
    name: string,
    options?: HydrateOptions,
  ) => Promise<{ html: string; result: unknown }>
  /**
   * Sends the request of a client call of server fn `id` to Start's server
   * entry of the SSR build (`callByIdPrelude`) and gives the result, or the
   * error message.
   */
  callServerFn: (id: string, data?: unknown) => Promise<unknown>
}

const exportName = (name: string) => `f_${name.replace(/\W/g, '_')}`

/**
 * Builds one app holding every fixture (`src/fixtures/<name>.tsx`, with the
 * other `files` of the app next to them) with Start's Vite plugin.
 */
export async function buildHydrationApp(options: {
  fixtures: Record<string, string>
  /** Other app files by path relative to the app root. */
  files?: Record<string, string>
  registerCleanup?: (cleanup: () => Promise<void>) => void
}): Promise<HydrationApp> {
  const names = Object.keys(options.fixtures)
  const fixtureExports = names
    .map(
      (name) => `export * as ${exportName(name)} from './src/fixtures/${name}'`,
    )
    .join('\n')
  const build = await buildStart({
    mode: 'development',
    registerCleanup: options.registerCleanup,
    files: {
      ...options.files,
      ...Object.fromEntries(
        names.map((name) => [
          `src/fixtures/${name}.tsx`,
          options.fixtures[name]!,
        ]),
      ),
      'client-entry.ts': `${fixtureExports}
export { createElement } from 'react'
export { createRoot, hydrateRoot } from 'react-dom/client'
`,
      'ssr-entry.ts': `${fixtureExports}
export { createElement } from 'react'
export { renderToString } from 'react-dom/server'
${callByIdExports}`,
    },
    entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
  })
  const element = (name: string, hydrateOptions: HydrateOptions) =>
    `(() => {
  const m = entry.${exportName(name)}
  const h = entry.createElement
  const props = ${JSON.stringify(hydrateOptions.props ?? {})}
  return ${hydrateOptions.render ?? 'h(m.Page, props)'}
})()`
  const renderServer = async (
    name: string,
    hydrateOptions: HydrateOptions = {},
  ) => {
    const { result } = await build.ssr.run(
      `const html = entry.renderToString(${element(name, hydrateOptions)})
return { html, result: ${hydrateOptions.serverScript ?? 'null'} }`,
    )
    return result as { html: string; result: unknown }
  }
  const hydrate = async (name: string, hydrateOptions: HydrateOptions = {}) => {
    const mount = hydrateOptions.mode === 'mount'
    const server = mount
      ? { html: '', result: null }
      : await renderServer(name, hydrateOptions)
    const { result } = await build.client.run(`
const settled = ${settledSource}
const waitFor = ${waitForSource}
const root = document.getElementById('root')
root.innerHTML = ${JSON.stringify(server.html)}
const snapshots = [root.innerHTML]
new MutationObserver(() => {
  if (snapshots.at(-1) !== root.innerHTML) {
    snapshots.push(root.innerHTML)
  }
}).observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
const consoleErrors = []
const consoleError = console.error
console.error = (...args) => {
  consoleErrors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
  consoleError(...args)
}
const scripts = () => performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script' || /\\.m?js(\\?|$)/.test(entry.name)).map((entry) => new URL(entry.name).pathname)
const before = new Set(scripts())
const requested = () => scripts().filter((name) => !before.has(name))
await (async () => { ${hydrateOptions.beforeHydration ?? ''} })()
const recoverableErrors = []
const element = ${element(name, hydrateOptions)}
if (${mount}) {
  entry.createRoot(root).render(element)
} else {
  entry.hydrateRoot(root, element, {
    onRecoverableError: (error) => {
      recoverableErrors.push(error instanceof Error ? error.message : String(error))
    },
  })
}
await settled()
const result = await (async () => { ${hydrateOptions.script ?? ''} })()
await settled()
return { html: root.innerHTML, snapshots, recoverableErrors, consoleErrors, requested: requested(), result }
`)
    return {
      serverHtml: server.html,
      serverResult: server.result,
      ...(result as Omit<Hydrated, 'serverHtml' | 'serverResult'>),
    }
  }
  const callServerFn = async (id: string, data?: unknown) => {
    const { result } = await build.ssr.run(`${callByIdPrelude}
try {
  return await callById(${JSON.stringify(id)}, ${JSON.stringify(data ?? null)})
} catch (error) {
  return error instanceof Error ? error.message : String(error)
}`)
    return result
  }
  return { build, hydrate, renderServer, callServerFn }
}
