/**
 * Real hydration of `<Hydrate>` pages: an app built with Start's own Vite or
 * Rsbuild plugin (`buildStart`: the Start compiler, its Hydrate plugin and
 * the real `@tanstack/react-start` or `@tanstack/solid-start`, in a
 * development build, so the framework reports hydration mismatches)
 * renders each fixture module to HTML in its SSR build (Node,
 * `react-dom/server` or Solid's `renderToString`), and a page of headless
 * Chromium hydrates that HTML with the client build: React's `hydrateRoot`
 * with its recoverable errors recorded, or Solid's `hydrate` after the
 * hydration script Solid's server generates. `console.error` output is
 * recorded too. A test script then runs in the page (e.g. clicks a child)
 * and its result is returned with the page's markup and the scripts the
 * page requested after it loaded.
 *
 * Solid apps get Solid's JSX transform of each bundler (`solidAppConfig`).
 *
 * Thin glue only: the compiler, bundler, React or Solid, router and Start
 * runtime are the real ones; the harness writes the entries, moves the
 * server's HTML into the page and waits until the page is quiet.
 */
import solid from 'vite-plugin-solid'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { buildStart, callByIdExports, callByIdPrelude } from '../build-harness'
import type { StartBuild, StartBundler } from '../build-harness'
import type { RsbuildConfig } from '@rsbuild/core'

/** The Start framework packages a page app can be built with. */
export type PageFramework = 'react' | 'solid'

export interface PageFixture {
  /** The fixture module (`src/fixtures/<name>.tsx`). */
  code: string
}

/**
 * JavaScript of a page script: waits until the page requested no new
 * resource and changed no markup for `quiet` ms (default 150), and stays so
 * across an idle period of the browser (`requestIdleCallback`: work that
 * waits for idle time, such as an `idle()` boundary's hydration, has had
 * its turn; parent-first hydration of nested boundaries shows up as a
 * change, which restarts the wait), at most `timeout` ms (default 10 000).
 * Only what the page shows and loads counts, no runtime marker.
 */
const settledSource = `async (quiet = 150, timeout = 10000) => {
  const start = performance.now()
  const state = () => performance.getEntriesByType('resource').length + ':' + document.body.innerHTML
  let last = ''
  let since = performance.now()
  while (performance.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const now = state()
    if (now !== last) {
      last = now
      since = performance.now()
      continue
    }
    if (performance.now() - since < quiet) {
      continue
    }
    await new Promise((resolve) => requestIdleCallback(resolve, { timeout: 500 }))
    await new Promise((resolve) => setTimeout(resolve, 25))
    if (state() === last) {
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
  /**
   * Errors React reported through `onRecoverableError` (always empty for
   * Solid, which has no such channel: a Solid mismatch throws, which fails
   * the run, or logs to `console.error`).
   */
  recoverableErrors: Array<string>
  /** `console.error` output of the page (hydration warnings). */
  consoleErrors: Array<string>
  /** Scripts the page requested after the server HTML was in place. */
  requested: Array<string>
  /** What the script returned. */
  result: unknown
}

export interface HydrateOptions {
  /**
   * What to render: a JavaScript expression with the fixture module as `m`,
   * `h(component, props)` (React's `createElement`, Solid's
   * `createComponent`) and `props` in scope (default `h(m.Page, props)`).
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
   * root (React's `createRoot`, Solid's `render`), like a boundary that
   * first appears after the app started (e.g. after a client-side
   * navigation). Default `hydrate`.
   */
  mode?: 'hydrate' | 'mount'
}

export interface HydrationApp {
  build: StartBuild
  framework: PageFramework
  bundler: StartBundler
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
   * error message (React apps).
   */
  callServerFn: (id: string, data?: unknown) => Promise<unknown>
}

/**
 * Page script of the parent-update scenario (SPEC J5.8; FIX-PLAN V2-19),
 * for a page with two keyed boundaries (`a`, `b`, hydrating on
 * interaction) rendering a child `<button data-item=name>` that shows
 * `name|count|theme|tag` and, when clicked, puts `name:count:theme` in the
 * page's `<output>`; the page's buttons `inc` (count), `theme` (the
 * context's value) and `reverse` (the order of the boundaries). The page
 * changes count and theme before any boundary hydrated, opens `a`,
 * changes count after `a` loaded, reverses the boundaries, changes count
 * again and opens `b`. Returns the children's texts at each step and the
 * picks (`updatesExpected`).
 */
export const updatesScript = `const texts = () => [...root.querySelectorAll('button[data-item]')].map((button) => button.textContent)
const picked = () => root.querySelector('output').textContent
const press = async (label) => {
  root.querySelector('button[data-label="' + label + '"]').click()
  await settled(50)
}
const picks = []
// Clicks the child until the page shows a new pick (the first click may only
// hydrate the boundary).
const pick = async (name) => {
  const before = picked()
  await waitFor(async () => {
    root.querySelector('button[data-item="' + name + '"]').click()
    await settled(50)
    return picked() !== before
  })
  picks.push(picked())
}
await press('inc')
await press('theme')
const beforeGate = texts()
await pick('a')
const opened = texts()
await press('inc')
const updated = texts()
await pick('a')
await press('reverse')
await press('inc')
const reordered = texts()
await pick('b')
await pick('a')
return { beforeGate, opened, updated, reordered, final: texts(), picks }`

/** What `updatesScript` returns when the children get the newest values. */
export const updatesExpected = {
  // Not hydrated yet: the server's HTML.
  beforeGate: ['a|0|light|r0', 'b|0|light|r0'],
  // `a` hydrates with the values of the latest render.
  opened: ['a|1|dark|r1', 'b|0|light|r0'],
  updated: ['a|2|dark|r2', 'b|0|light|r0'],
  reordered: ['b|0|light|r0', 'a|3|dark|r3'],
  final: ['b|3|dark|r3', 'a|3|dark|r3'],
  // The callback of the latest render, of the boundary clicked.
  picks: ['a:1:dark', 'a:2:dark', 'b:3:dark', 'a:3:dark'],
}

/**
 * Page script for a boundary hydrating on interaction around a counter
 * `<button data-label="child">` showing `child:<clicks>`: how many scripts
 * the page requested before the first click, and whether clicking (until
 * the counter counts) requested more.
 */
export const loadedOnInteraction = `const beforeClick = requested().length
const button = () => root.querySelector('button[data-label="child"]')
await waitFor(async () => {
  button().click()
  await settled(50)
  return button().textContent === 'child:1'
})
return { beforeClick, loadedByClick: requested().length > beforeClick }`

const exportName = (name: string) => `f_${name.replace(/\W/g, '_')}`

/**
 * The bundler configuration of a Solid Start app: Vite with
 * `vite-plugin-solid` (SSR output in the server environment); Rsbuild with
 * `@rsbuild/plugin-babel` and `@rsbuild/plugin-solid` (Solid's Babel preset,
 * hydratable, generating the DOM output for the client and the SSR output
 * for the server) and the `solid` export condition, which the Solid
 * packages publish their JSX sources under.
 */
export const solidAppConfig = {
  viteConfig: { plugins: [solid({ ssr: true })] },
  rsbuildConfig: {
    plugins: [pluginBabel({ include: /\.(?:jsx|tsx)$/ })],
    environments: {
      client: {
        plugins: [
          pluginSolid({
            solidPresetOptions: { generate: 'dom', hydratable: true },
          }),
        ],
      },
      ssr: {
        plugins: [
          pluginSolid({
            solidPresetOptions: { generate: 'ssr', hydratable: true },
          }),
        ],
      },
    },
    resolve: { conditionNames: ['solid', '...'] },
  } satisfies RsbuildConfig,
}

/**
 * The entries of an app of `framework`: the fixtures and what renders them
 * (`h`), and in the client what hydrates and mounts them.
 */
function pageEntries(framework: PageFramework, fixtureExports: string) {
  if (framework === 'solid') {
    return {
      'client-entry.ts': `${fixtureExports}
export { createComponent as h, hydrate, render } from 'solid-js/web'
`,
      'ssr-entry.ts': `${fixtureExports}
export { createComponent as h, generateHydrationScript, renderToString } from 'solid-js/web'
`,
    }
  }
  return {
    'client-entry.ts': `${fixtureExports}
export { createElement as h } from 'react'
export { createRoot, hydrateRoot } from 'react-dom/client'
`,
    'ssr-entry.ts': `${fixtureExports}
export { createElement as h } from 'react'
export { renderToString } from 'react-dom/server'
${callByIdExports}`,
  }
}

/**
 * Builds one app holding every fixture (`src/fixtures/<name>.tsx`, with the
 * other `files` of the app next to them) with Start's plugin of `bundler`
 * (default `vite`) and the Start package of `framework` (default `react`).
 */
export async function buildHydrationApp(options: {
  fixtures: Record<string, string>
  /** Other app files by path relative to the app root. */
  files?: Record<string, string>
  registerCleanup?: (cleanup: () => Promise<void>) => void
  framework?: PageFramework
  bundler?: StartBundler
}): Promise<HydrationApp> {
  const { framework = 'react', bundler = 'vite' } = options
  const names = Object.keys(options.fixtures)
  const fixtureExports = names
    .map(
      (name) => `export * as ${exportName(name)} from './src/fixtures/${name}'`,
    )
    .join('\n')
  const build = await buildStart({
    bundler,
    framework,
    mode: 'development',
    registerCleanup: options.registerCleanup,
    ...(framework === 'solid' && solidAppConfig),
    files: {
      ...options.files,
      ...Object.fromEntries(
        names.map((name) => [
          `src/fixtures/${name}.tsx`,
          options.fixtures[name]!,
        ]),
      ),
      ...pageEntries(framework, fixtureExports),
    },
    entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
  })
  /**
   * A function returning what the page renders: Solid renders the function
   * itself, React the element it returns.
   */
  const make = (name: string, hydrateOptions: HydrateOptions) => `() => {
  const m = entry.${exportName(name)}
  const h = (type, props) => entry.h(type, props ?? {})
  const props = ${JSON.stringify(hydrateOptions.props ?? {})}
  return ${hydrateOptions.render ?? 'h(m.Page, props)'}
}`
  const renderServer = async (
    name: string,
    hydrateOptions: HydrateOptions = {},
  ) => {
    const { result } = await build.ssr.run(
      framework === 'solid'
        ? `const html = entry.renderToString(${make(name, hydrateOptions)})
return { html, result: ${hydrateOptions.serverScript ?? 'null'}, hydrationScript: entry.generateHydrationScript() }`
        : `const html = entry.renderToString((${make(name, hydrateOptions)})())
return { html, result: ${hydrateOptions.serverScript ?? 'null'} }`,
    )
    return result as { html: string; result: unknown; hydrationScript?: string }
  }
  /** Page code mounting or hydrating `element` (a `make` function) in `root`. */
  const start =
    framework === 'solid'
      ? {
          mount: (element: string) => `entry.render(${element}, root)`,
          hydrate: (element: string) => `entry.hydrate(${element}, root)`,
        }
      : {
          mount: (element: string) =>
            `entry.createRoot(root).render(${element}())`,
          hydrate: (element: string) => `entry.hydrateRoot(root, ${element}(), {
    onRecoverableError: (error) => {
      recoverableErrors.push(error instanceof Error ? error.message : String(error))
    },
  })`,
        }
  const hydrate = async (name: string, hydrateOptions: HydrateOptions = {}) => {
    const mount = hydrateOptions.mode === 'mount'
    const server: { html: string; result: unknown; hydrationScript?: string } =
      mount
        ? { html: '', result: null }
        : await renderServer(name, hydrateOptions)
    const { result } = await build.client.run(`
const settled = ${settledSource}
const waitFor = ${waitForSource}
const root = document.getElementById('root')
// What Solid's server puts in the document head (it records the events of
// the page until it hydrates).
const hydrationScript = ${JSON.stringify(server.hydrationScript ?? '')}
for (const script of new DOMParser().parseFromString(hydrationScript, 'text/html').querySelectorAll('script')) {
  const running = document.createElement('script')
  running.textContent = script.textContent
  document.head.append(running)
}
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
const element = ${make(name, hydrateOptions)}
if (${mount}) {
  ${start.mount('element')}
} else {
  ${start.hydrate('element')}
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
  return { build, framework, bundler, hydrate, renderServer, callServerFn }
}
