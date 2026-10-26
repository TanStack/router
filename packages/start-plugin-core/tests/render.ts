/**
 * `<Hydrate>` modules rendered and hydrated through the public Start
 * plugin: the case module of a Start app on a real dev server
 * (`./start-host`: `tanstackStart()` and the framework's Vite plugin) is
 *
 * - rendered on the server by the SSR environment (its module runner
 *   evaluates the module as the dev server compiles it for SSR) with React's
 *   own server renderer (`react-dom/static`'s `prerenderToNodeStream`, which
 *   waits for lazy components and Suspense like a streaming render), reached
 *   through an app module so React is the app's own instance;
 * - hydrated on the client in a real Chromium page of the same dev server:
 *   the page imports the module as a browser does, puts the server's HTML in
 *   a fresh container and hydrates it with `hydrateRoot` (React's
 *   development build, which reports mismatches through
 *   `onRecoverableError` and `console.error`), then opens every boundary's
 *   gate (a boundary becomes visible, an interaction event reaches it, idle
 *   and load gates open themselves) and waits until the page is quiet;
 * - compared with the uncompiled source (`renderSource`): the same files on
 *   a plain Vite dev server with only `@vitejs/plugin-react` (no Start
 *   plugin), rendered by its SSR environment with the same renderer, where
 *   the real `Hydrate` renders its children in place.
 *
 * Markup is compared semantically: the page parses each HTML
 * string and serializes its DOM again with sorted attributes, merged text
 * and no comments (`html`), hydration ids blanked where the uncompiled
 * source is the reference. What loads when is read from the page's own
 * resource timing: `loaded` (the case files the import of the module
 * requested) and `lazy` (everything the page requested once hydration
 * started: the split code, wherever the compiler put it). Nothing here names
 * a compiler internal: no plugin, virtual module id, query or chunk count.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { normalizePath } from 'vite'
import { afterAll, beforeAll, expect } from 'vitest'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import {
  currentTest,
  onTestFinished,
} from '@tanstack/compiler-test-utils/test-scope'
import { createStartHost, giveBackHost, hostKey, takeHost } from './start-host'
import type { PluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import type { StartCase, StartHost } from './start-host'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** The app modules that render (server) and hydrate (client) a case. */
const renderFiles = {
  'src/harness/render.server.tsx': `import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
export const h = createElement
export async function renderToHtml(element: unknown) {
  const errors: Array<unknown> = []
  const { prelude } = await prerenderToNodeStream(element as any, {
    onError: (error: unknown) => {
      errors.push(error)
    },
  })
  let html = ''
  for await (const part of prelude) {
    html += String(part)
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'rendering failed: ' +
        errors.map((error) => (error instanceof Error ? error.message : String(error))).join('; '),
    )
  }
  return html
}
`,
  'src/harness/render.client.tsx': `export { createElement as h } from 'react'
export { createRoot, hydrateRoot } from 'react-dom/client'
`,
}

/** The reference host's files: the renderer and the cases' runtime. */
const referenceFiles = {
  'src/harness/render.server.tsx': renderFiles['src/harness/render.server.tsx'],
}

const casesDir = 'src/cases'

/**
 * The app's `tsconfig.json`: with `verbatimModuleSyntax`, as a Start app
 * configures it (otherwise the app inherits this package's tsconfig, and
 * Vite's TypeScript transform erases unreferenced imports after the
 * compilers ran, hiding what they left behind).
 */
const appTsconfig = (jsx: Record<string, string>) =>
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      verbatimModuleSyntax: true,
      ...jsx,
    },
  })
const reactTsconfig = appTsconfig({ jsx: 'react-jsx' })

/**
 * The Start plugin options of the hosts: import protection off (its dev
 * mocks of denied `*.server.*` imports on the client would hide what the
 * compiler ships), as the other Start compiler suites run it.
 */
const startOptions = { importProtection: { enabled: false } }

/** A plain Vite dev server rendering uncompiled modules (no Start plugin). */
export interface ReferenceHost {
  host: PluginHost
  /** Writes a case (files relative to its directory); returns its directory. */
  case: (files: Record<string, string>) => Promise<string>
  close: () => Promise<void>
}

async function createReferenceHost(): Promise<ReferenceHost> {
  const host = await createPluginHost({
    dir: harnessDir,
    prefix: '.hydrate-reference-',
    plugins: [react()],
    config: { server: { watch: { ignored: [`**/${casesDir}/**`] } } },
    symlinks: workspacePackageLinks(['@tanstack/react-start']),
    files: { ...referenceFiles, 'tsconfig.json': reactTsconfig },
  })
  let cases = 0
  return {
    host,
    case: async (files) => {
      const dir = `${casesDir}/r${++cases}`
      await writeCase(host.root, dir, files)
      return dir
    },
    close: () => host.close(),
  }
}

async function writeCase(
  root: string,
  dir: string,
  files: Record<string, string>,
) {
  for (const [file, code] of Object.entries(files)) {
    const absolute = path.join(root, dir, file)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, code)
  }
}

/** The Start host and the uncompiled-source reference host of a test file. */
export interface HydrateHost {
  start: StartHost
  reference: () => Promise<ReferenceHost>
  /**
   * Whether the Start host writes cases (`StartHost.case`). An edit host
   * (`useEditHost`) writes only watched files, through the dev server's
   * watcher, and runs page code in its page directly.
   */
  cases: boolean
}

/** The result of page code (`runPage`). */
interface PageResult<T> {
  result: T
  errors: Array<string>
}

/**
 * Runs page code (the body of an async function) in the Start host's page:
 * through a case of the host (`StartCase.client`, which reruns it on a
 * fresh document when the page reloaded), or, on an edit host, in the page
 * itself.
 */
async function runPage<T>(
  hosts: HydrateHost,
  script: string,
  startCase?: StartCase,
  runOptions: { fresh?: boolean } = {},
): Promise<PageResult<T>> {
  if (startCase || hosts.cases) {
    const runner = startCase ?? (await runnerCase(hosts))
    for (let attempt = 0; ; attempt++) {
      try {
        const run = await runner.client<T>(script, {
          file: 'setup.ts',
          fresh: runOptions.fresh,
        })
        return { result: run.result, errors: run.errors }
      } catch (error) {
        // A reload an earlier case caused (the dev server reloads its pages
        // when a module it served fails) can still be under way when this
        // run starts: run again on the new document.
        if (
          attempt >= 2 ||
          !/Execution context was destroyed/.test(String(error))
        ) {
          throw error
        }
      }
    }
  }
  const run = await hosts.start.run<T>(`(async () => {\n${script}\n})()`, {
    fresh: runOptions.fresh,
  })
  return { result: run.result, errors: run.errors }
}

/** The options of the hosts of `useHydrateHost`. */
const hydrateHostOptions = {
  start: startOptions,
  files: { ...renderFiles, 'tsconfig.json': reactTsconfig },
}
const hydrateHostKey = `hydrate ${hostKey(hydrateHostOptions)}`
const referenceHostKey = 'hydrate reference'

/**
 * One Start host (React) and, on first use, one reference host per test
 * file, taken before its tests (free ones an earlier file of the test
 * process gave back, or new ones: `takeHost`) and given back after them.
 */
export function useHydrateHost(): () => Promise<HydrateHost> {
  let started: Promise<HydrateHost> | undefined
  let reference: Promise<ReferenceHost> | undefined
  beforeAll(() => {
    started = takeHost(hydrateHostKey, () =>
      createStartHost(hydrateHostOptions),
    ).then((start) => ({
      start,
      reference: () =>
        (reference ??= takeHost(referenceHostKey, createReferenceHost)),
      cases: true,
    }))
    // The page and the renderers, before the first test
    return started.then((hosts) => warm(hosts))
  }, 60_000)
  afterAll(async () => {
    try {
      const referenceHost = await reference?.catch(() => undefined)
      if (referenceHost) {
        await giveBackHost(referenceHostKey, referenceHost)
      }
    } finally {
      const hosts = await started?.catch(() => undefined)
      if (hosts) {
        await giveBackHost(hydrateHostKey, hosts.start)
      }
    }
  })
  return () => {
    if (!started) {
      throw new Error('useHydrateHost: no host before beforeAll ran')
    }
    return started
  }
}

/** Loads the page and the renderers. */
async function warm(hosts: HydrateHost) {
  await runPage(
    hosts,
    `await Promise.all([import('/src/harness/render.client.tsx'), import('/@id/@tanstack/react-start'), import('/@id/@tanstack/react-start/hydration')])`,
  )
  await hosts.start.host.importServer('/src/harness/render.server.tsx')
}

/**
 * A Start host for dev edits (React), one per test (its own dev server and
 * page: an edit's hot updates and reloads reach no other test), created on
 * first use in the test and closed when the test ends: it writes no case,
 * so its dev server's settle after an edit (`StartHost.edit`) sees only
 * watched files. Use `editableFiles` and watched route files with it;
 * `renderClient` with a `target`.
 */
export function useEditHost(): () => Promise<HydrateHost> {
  const started = new WeakMap<object, Promise<HydrateHost>>()
  const outsideTests = {}
  return () => {
    const test = currentTest()
    const owner = test ?? outsideTests
    let hosts = started.get(owner)
    if (!hosts) {
      hosts = createStartHost({
        start: startOptions,
        files: { ...renderFiles, 'tsconfig.json': reactTsconfig },
      }).then(async (start) => {
        // The page loads its runtime before an edit reloads it
        await start.run('1')
        return {
          start,
          reference: () => {
            throw new Error('an edit host has no reference host')
          },
          cases: false,
        }
      })
      started.set(owner, hosts)
      const created = hosts
      onTestFinished(async () => {
        await (await created.catch(() => undefined))?.start.close()
      })
    }
    return hosts
  }
}

export interface RenderOptions {
  /**
   * What to render: a JavaScript expression with the module as `m`, React's
   * `createElement` as `h` and `props` in scope, evaluated on the server and
   * in the page (default `h(m.Page, props)`). It runs inside a component, so
   * hooks it calls run there.
   */
  render?: string
  /** JSON props of the render. */
  props?: Record<string, unknown>
  /**
   * Project modules the module imports, by relative specifier
   * (`'./widgets'`, a `.tsx` module unless it has an extension) or path
   * relative to the case directory, written as real files.
   */
  files?: Record<string, string>
  /**
   * Source of a module (`setup.ts` of the case) each realm (the server, the
   * reference, the page) evaluates before the module: globals the fixture
   * reads, counters it resets. The page is shared by the cases of a file:
   * the module exports `cleanup`, the names of the globals it defines, which
   * the page deletes after the run.
   */
  setup?: string
  /**
   * App code each realm runs once the module evaluated, before it renders
   * (statements with the module as `m` in scope), e.g. what the route tree
   * of an app does to a route module.
   */
  beforeRender?: string
  /** The module's file in the case (default `module.tsx`). */
  file?: string
}

export interface ClientOptions extends RenderOptions {
  /**
   * Body of an async function run in the page once the page hydrated and
   * every gate opened, with `root` (the container), `m`, `settled()` and
   * `openGates()` in scope; its JSON value is `result`.
   */
  script?: string
  /**
   * Which gates the run opens: `'all'` (default), `'none'` (only idle and
   * load gates open themselves), or a page expression of a function that
   * gets a boundary still waiting for its gate (the element carrying the
   * runtime's gate marker) and says whether to open it, e.g.
   * `(boundary) => boundary.textContent.includes('chart')`.
   */
  gates?: 'all' | 'none' | string
}

const caseFileName = (specifier: string) => {
  if (!specifier.startsWith('./')) {
    return specifier
  }
  const relative = specifier.slice(2)
  return /\.[\w]+$/.test(relative) ? relative : `${relative}.tsx`
}

/** The case files of `code` and `options.files`. */
function caseFiles(code: string, options: RenderOptions) {
  const files: Record<string, string> = {
    'setup.ts': options.setup ?? 'export {}\n',
  }
  for (const [specifier, source] of Object.entries(options.files ?? {})) {
    files[caseFileName(specifier)] = source
  }
  files[options.file ?? 'module.tsx'] = code
  return files
}

const renderExpression = (options: RenderOptions) =>
  options.render ?? 'h(m.Page, props)'

/** Renders `m` with the SSR renderer module of a host (in this process). */
async function renderWith(
  renderer: Record<string, any>,
  module: Record<string, any>,
  options: RenderOptions,
) {
  const render = new Function(
    'm',
    'h',
    'props',
    `return (${renderExpression(options)})`,
  ) as (m: unknown, h: unknown, props: unknown) => unknown
  if (options.beforeRender !== undefined) {
    await (
      new Function(
        'm',
        `return (async () => {\n${options.beforeRender}\n})()`,
      ) as (m: unknown) => Promise<unknown>
    )(module)
  }
  const props = options.props ?? {}
  const Root = () => render(module, renderer.h, props)
  return (await renderer.renderToHtml(renderer.h(Root))) as string
}

/**
 * Page code: `normalize(html, { ids })`, the DOM of `html` serialized again
 * with sorted attributes, merged text nodes and no comments; hydration ids
 * kept (`ids: true`), blanked (`false`), or kept for the boundaries no other
 * boundary contains (`'outer'`).
 */
const normalizeSource = `const normalize = (html, { ids = true } = {}) => {
  const template = document.createElement('template')
  template.innerHTML = html
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
  const text = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\u00a0/g, '&nbsp;')
  const attribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const walk = (node) => {
    let out = ''
    let pending = null
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        pending = (pending ?? '') + child.data
        continue
      }
      if (pending !== null) {
        out += text(pending)
        pending = null
      }
      if (child.nodeType !== 1) {
        continue
      }
      // A wrapper the runtime renders around a boundary's content while it
      // waits (display: contents: no box of its own) is not markup.
      if (child.localName === 'div' && child.attributes.length === 1 && child.getAttribute('style')?.replace(/\\s/g, '') === 'display:contents;') {
        out += walk(child)
        continue
      }
      const tag = child.localName
      // The gate-state marker is the runtime's (it drops it once a boundary
      // hydrated): not markup the compiler renders.
      const attributes = [...child.attributes]
        .filter((attr) => attr.name !== 'data-ts-hydrate-when')
        .map((attr) => [
          attr.name,
          attr.name === 'data-ts-hydrate-id' &&
          (ids === false || (ids === 'outer' && child.parentElement?.closest('[data-ts-hydrate-id]')))
            ? ''
            : attr.value,
        ])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      out += '<' + tag + attributes.map(([name, value]) => ' ' + name + '="' + attribute(value) + '"').join('') + '>'
      if (!voids.has(tag)) {
        out += walk(child.content ?? child) + '</' + tag + '>'
      }
    }
    if (pending !== null) {
      out += text(pending)
    }
    return out
  }
  return walk(template.content)
}`

/** Normalizes HTML strings in the host page (`normalizeSource`). */
async function normalizeInPage(
  hosts: HydrateHost,
  htmls: Array<string>,
  ids: boolean,
): Promise<Array<string>> {
  const run = await runPage<Array<string>>(
    hosts,
    `${normalizeSource}
return ${JSON.stringify(htmls)}.map((html) => normalize(html, { ids: ${ids} }))`,
  )
  return run.result
}

/** The markup with every hydration id blanked. */
export function withoutHydrationIds(html: string) {
  return html.replace(/ data-ts-hydrate-id="[^"]*"/g, ' data-ts-hydrate-id=""')
}

/** A case of the Start host whose page runs the render kit's page code. */
const runners = new WeakMap<HydrateHost, Promise<StartCase>>()
function runnerCase(hosts: HydrateHost) {
  let runner = runners.get(hosts)
  if (!runner) {
    runner = hosts.start.case({ 'setup.ts': 'export {}\n' })
    runners.set(hosts, runner)
  }
  return runner
}

export interface ServerRender {
  /** The normalized markup (hydration ids kept). */
  html: string
  /** The HTML React rendered. */
  raw: string
  /** The case the module was written to. */
  case: StartCase
  /** What the SSR environment serves for the module. */
  code: string
  /** The module the SSR environment evaluated. */
  module?: Record<string, any>
}

/**
 * Renders the uncompiled `code` (the reference: `<Hydrate>` renders its
 * children in place) on the reference host's server. `html` is normalized
 * (in the Start host's page) with hydration ids blanked.
 */
export async function renderSource(
  hosts: HydrateHost,
  code: string,
  options: RenderOptions = {},
): Promise<{ html: string; raw: string }> {
  const reference = await hosts.reference()
  const dir = await reference.case(caseFiles(code, options))
  await reference.host.importServer(`/${dir}/setup.ts`)
  const module = await reference.host.importServer(
    `/${dir}/${options.file ?? 'module.tsx'}`,
  )
  const renderer = await reference.host.importServer(
    '/src/harness/render.server.tsx',
  )
  const raw = await renderWith(renderer, module, options)
  const [html] = await normalizeInPage(hosts, [raw], false)
  return { html: html!, raw }
}

/** Renders the case module on the Start host's server (SSR environment). */
async function serverRender(
  hosts: HydrateHost,
  target: RenderTarget,
  options: RenderOptions,
) {
  const file = options.file ?? 'module.tsx'
  const code = await target.served(file, 'ssr')
  if (target.setup !== false) {
    await target.ssr(target.setup ?? 'setup.ts')
  }
  const module = await target.ssr(file)
  const renderer = await hosts.start.host.importServer(
    '/src/harness/render.server.tsx',
  )
  return { raw: await renderWith(renderer, module, options), code, module }
}

/**
 * Compiles `code` with the Start plugin for the server (the SSR environment
 * serves and evaluates it) and renders it.
 */
export async function renderServer(
  hosts: HydrateHost,
  code: string,
  options: RenderOptions = {},
): Promise<ServerRender> {
  const startCase = await hosts.start.case(caseFiles(code, options))
  const rendered = await serverRender(hosts, caseTarget(startCase), options)
  const [html] = await normalizeInPage(hosts, [rendered.raw], true)
  return {
    html: html!,
    raw: rendered.raw,
    case: startCase,
    code: rendered.code,
    module: rendered.module,
  }
}

export interface ClientRender {
  case: StartCase
  /** The server render the page hydrated. */
  server: ServerRender
  /** The normalized markup of the container after hydration and the script. */
  html: string
  /** The container's `innerHTML` after hydration and the script. */
  raw: string
  /**
   * `html` with the hydration ids of nested boundaries blanked: a boundary
   * inside split children renders with them when their code loads, so its
   * id is the client's own (`serverOuter`: the server's markup the same way).
   */
  outer: string
  serverOuter: string
  /** What React reported through `onRecoverableError` (mismatches). */
  recoverableErrors: Array<string>
  /**
   * Uncaught errors of the page during the run, and what React logged about
   * hydration (`console.error` messages about hydration or a mismatch).
   * React's other development warnings (a missing `key`, an unknown DOM
   * property) are about the fixture's own code, not its compilation: they
   * are in `warnings`.
   */
  errors: Array<string>
  /** Every other `console.error` message of the page during the run. */
  warnings: Array<string>
  /**
   * Case files (`./name`, with and without extension) the import of the
   * module requested, before hydration.
   */
  loaded: Array<string>
  /**
   * What the page requested once hydration started: case files as
   * `./name` (with and without extension), other modules by path.
   */
  lazy: Array<string>
  /** `lazy` as the page requested it (paths with their query). */
  lazyUrls: Array<string>
  /**
   * What the import of the module requested, before hydration, as the page
   * requested it (paths with their query; modules of any kind).
   */
  importedUrls: Array<string>
  /**
   * The case's own code among `lazyUrls`: the modules the page requested
   * once hydration started whose served code's source map names a file of
   * the case directory (or, served with an empty map, that the case
   * module's own graph imports: through the case's own modules only),
   * wherever the compiler put them and under any id. Code of a package, of
   * the harness or of Vite, and a module the dev server fails to serve, is
   * not the case's split code.
   */
  chunks: Array<string>
  /** What the script returned. */
  result: unknown
}

/** A `console.error` message of React about hydration. */
const hydrationMessage =
  /hydration failed|tree hydrated|didn't match|did not match|while hydrating|hydration mismatch/i

/** Page code: `settled(quiet)`, `openGates()`. */
const settleSource = `const settled = async (quiet = 30, timeout = 10000) => {
  const start = performance.now()
  let last = ''
  let since = performance.now()
  while (performance.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    // A module request still in flight (the page's own count, from the
    // browser's network events) keeps the page busy.
    const inFlight = window.__harnessInFlight ? await window.__harnessInFlight() : 0
    const state = performance.getEntriesByType('resource').length + ':' + inFlight + ':' + root.innerHTML
    if (state !== last || inFlight > 0) {
      last = state
      since = performance.now()
    } else if (performance.now() - since >= quiet) {
      return
    }
  }
  throw new Error('the page did not settle: ' + root.innerHTML)
}
const nonActivating = (events) => events.filter((name) => !/click|pointerdown|mousedown|mouseup|pointerup|keydown|keyup|contextmenu/.test(name))
// Boundaries still waiting for their gate (the runtime drops the marker once
// one hydrated); a never() gate never opens.
const pending = (which = () => true) => [...root.querySelectorAll('[data-ts-hydrate-when]')].filter((marker) => marker.getAttribute('data-ts-hydrate-when') !== 'never').filter(which)
// Gates that open on their own or on an event this opens: wait for them
// (an idle gate waits for the page to be idle, which a busy machine
// delays); a media or condition gate may never open.
const awaited = (which) => pending(which).filter((marker) => ['idle', 'interaction', 'dynamic', 'visible', 'load'].includes(marker.getAttribute('data-ts-hydrate-when')))
const openGates = async (timeout = 8000, stuck = 1500, which = () => true) => {
  const deadline = performance.now() + timeout
  let unchanged = 0
  let changedAt = performance.now()
  // An awaited gate gets time to open (an idle callback waits for an idle
  // page); one that stays shut with nothing changing for \`stuck\` ms
  // (its split code failed) does not hold the run up to the deadline.
  for (let round = 0; pending(which).length > 0 && (awaited(which).length > 0 ? performance.now() < deadline && performance.now() - changedAt < stuck : unchanged < 4); round++) {
    const before = root.innerHTML + ':' + performance.getEntriesByType('resource').length
    for (const marker of pending(which)) {
      marker.scrollIntoView()
      const when = marker.getAttribute('data-ts-hydrate-when')
      if (when === 'interaction' || when === 'dynamic') {
        const listed = marker.getAttribute('data-ts-hydrate-interaction-events')
        const events = listed === null ? ['pointerenter', 'focusin', 'pointerdown', 'click'] : listed.split(/\\s+/).filter(Boolean)
        const quiet = nonActivating(events)
        // Not bubbling: the gate opens, and no handler replays the event.
        for (const name of when === 'dynamic' ? ['click'] : quiet.length > 0 ? quiet : events) {
          marker.dispatchEvent(new Event(name, { bubbles: false }))
        }
      }
    }
    await settled()
    unchanged = root.innerHTML + ':' + performance.getEntriesByType('resource').length === before ? unchanged + 1 : 0
    if (unchanged === 0) {
      changedAt = performance.now()
    }
  }
}`

/**
 * Where a module to render lives: a case of the Start host (`StartCase`), or
 * a directory of watched app files (`editableFiles`, for dev edits).
 */
export interface RenderTarget {
  /** Directory relative to the app root. */
  dir: string
  /** The SSR environment's namespace of a file of the directory. */
  ssr: (file: string) => Promise<Record<string, any>>
  /** What the SSR environment serves for a file of the directory. */
  served: (file: string, environment: 'client' | 'ssr') => Promise<string>
  /** The setup module of the directory (default `setup.ts`; `false`: none). */
  setup?: string | false
}

function caseTarget(startCase: StartCase): RenderTarget {
  return {
    dir: startCase.dir,
    ssr: (file) => startCase.ssr(file),
    served: (file, environment) => startCase.served(file, environment),
  }
}

/**
 * A directory of watched app files of the Start host (`src/edits/e<n>`),
 * written and edited through the dev server's watcher (`StartHost.edit`):
 * for dev-edit scenarios, where the dev server compiles a module again.
 */
export async function editableFiles(
  hosts: HydrateHost,
  code: string,
  options: RenderOptions = {},
) {
  const dir = `src/edits/e${++edits}`
  const write = (files: Record<string, string>) =>
    hosts.start.edit(
      Object.fromEntries(
        Object.entries(files).map(([file, source]) => [
          `${dir}/${file}`,
          source,
        ]),
      ),
    )
  await write(caseFiles(code, options))
  const url = (file: string) => `/${dir}/${file}`
  const target: RenderTarget = {
    dir,
    ssr: (file) => hosts.start.host.importServer(url(file), 'ssr'),
    served: (file, environment) =>
      hosts.start.host.transform(url(file), environment),
  }
  return {
    target,
    /** Writes the module again (through the watcher). */
    edit: (source: string) => write({ [options.file ?? 'module.tsx']: source }),
  }
}
let edits = 0

/**
 * Compiles `code` with the Start plugin, renders it on the server and
 * hydrates the HTML in the host's page (see the module comment), opening
 * the gates `options.gates` names (default every gate), then runs `script`. With `target`, the
 * module is not written: it is the one of that case or directory.
 */
export async function renderClient(
  hosts: HydrateHost,
  code: string,
  options: ClientOptions & {
    target?: RenderTarget | StartCase
    /** Reload the page first: a fresh document, no module instance kept. */
    freshPage?: boolean
  } = {},
): Promise<ClientRender> {
  const given = options.target
  // The case of the module (a new one, or the given case); a directory of
  // other files renders through the runner case's page.
  const startCase: StartCase | undefined =
    given === undefined
      ? await hosts.start.case(caseFiles(code, options))
      : 'client' in given
        ? given
        : undefined
  const target: RenderTarget = startCase
    ? caseTarget(startCase)
    : (given as RenderTarget)
  const rendered = await serverRender(hosts, target, options)
  const file = options.file ?? 'module.tsx'

  const caseUrl = (name: string) => JSON.stringify(`/${target.dir}/${name}`)
  const run = await runPage<{
    raw: string
    serverHtml: string
    html: string
    recoverableErrors: Array<string>
    consoleErrors: Array<string>
    uncaught: Array<string>
    loaded: Array<string>
    importedUrls: Array<string>
    lazy: Array<string>
    lazyUrls: Array<string>
    serverOuter: string
    outer: string
    result: unknown
  }>(
    hosts,
    `performance.setResourceTimingBufferSize(100000)
const caseDir = ${JSON.stringify(`/${target.dir}/`)}
const requested = (from) => performance.getEntriesByType('resource').slice(from).map((entry) => {
  const url = new URL(entry.name)
  return url.origin === location.origin ? decodeURIComponent(url.pathname) + url.search : entry.name
})
const caseNames = (urls) => [...new Set(urls.flatMap((url) => {
  const pathname = url.split('?')[0]
  if (!pathname.startsWith(caseDir)) {
    return [pathname]
  }
  const relative = pathname.slice(caseDir.length)
  return ['./' + relative.replace(/\\.[cm]?[jt]sx?$/, ''), './' + relative]
}))]
const glue = await import('/src/harness/render.client.tsx')
const setup = ${target.setup === false ? '{}' : `await import(${caseUrl(target.setup ?? 'setup.ts')})`}
const beforeImport = performance.getEntriesByType('resource').length
const m = await import(${caseUrl(file)})
const importedUrls = requested(beforeImport)
const loaded = caseNames(importedUrls).filter((name) => name.startsWith('./'))
await (async () => {
${options.beforeRender ?? ''}
})()
const root = document.createElement('div')
document.body.append(root)
${normalizeSource}
${settleSource}
const serverHtml = ${JSON.stringify(rendered.raw)}
root.innerHTML = serverHtml
const recoverableErrors = []
const consoleErrors = []
const consoleError = console.error
console.error = (...args) => {
  consoleErrors.push(args.map((arg) => (arg instanceof Error ? arg.stack ?? arg.message : String(arg))).join(' '))
  consoleError(...args)
}
const uncaught = []
const onError = (event) => uncaught.push(String(event.error && (event.error.stack || event.error.message) || event.message))
const onRejection = (event) => uncaught.push(String(event.reason && (event.reason.stack || event.reason.message) || event.reason))
window.addEventListener('error', onError)
window.addEventListener('unhandledrejection', onRejection)
let reactRoot
try {
  const h = glue.h
  const props = ${JSON.stringify(options.props ?? {})}
  const Root = () => (${renderExpression(options)})
  const beforeHydration = performance.getEntriesByType('resource').length
  reactRoot = glue.hydrateRoot(root, h(Root), {
    onRecoverableError: (error) => {
      recoverableErrors.push(error instanceof Error ? error.message : String(error))
    },
  })
  await settled()
  ${
    options.gates === 'none'
      ? ''
      : options.gates === undefined || options.gates === 'all'
        ? 'await openGates()'
        : `await openGates(undefined, undefined, ${options.gates})`
  }
  const result = await (async () => {
${options.script ?? 'return null'}
  })()
  ${options.script ? 'await settled()' : ''}
  const lazyUrls = requested(beforeHydration)
  return {
    raw: root.innerHTML,
    serverHtml: normalize(serverHtml),
    html: normalize(root.innerHTML),
    serverOuter: normalize(serverHtml, { ids: 'outer' }),
    outer: normalize(root.innerHTML, { ids: 'outer' }),
    recoverableErrors,
    consoleErrors,
    uncaught,
    loaded,
    importedUrls,
    lazy: caseNames(lazyUrls),
    lazyUrls,
    result: result === undefined ? null : result,
  }
} finally {
  console.error = consoleError
  window.removeEventListener('error', onError)
  window.removeEventListener('unhandledrejection', onRejection)
  reactRoot?.unmount()
  root.remove()
  for (const name of setup.cleanup ?? []) {
    delete globalThis[name]
  }
}`,
    startCase,
    { fresh: options.freshPage },
  )
  const chunks = await caseCode(hosts, target.dir, file, run.result.lazyUrls)
  const caseForResult = startCase ?? (target as unknown as StartCase)
  return {
    case: caseForResult,
    server: {
      html: run.result.serverHtml,
      raw: rendered.raw,
      case: caseForResult,
      code: rendered.code,
    },
    html: run.result.html,
    outer: run.result.outer,
    serverOuter: run.result.serverOuter,
    raw: run.result.raw,
    recoverableErrors: run.result.recoverableErrors,
    errors: [
      ...run.result.uncaught,
      ...run.result.consoleErrors.filter((message) =>
        hydrationMessage.test(message),
      ),
    ],
    warnings: run.result.consoleErrors.filter(
      (message) => !hydrationMessage.test(message),
    ),
    loaded: run.result.loaded,
    importedUrls: run.result.importedUrls,
    lazy: run.result.lazy,
    lazyUrls: run.result.lazyUrls,
    chunks,
    result: run.result.result,
  }
}

/**
 * The URLs among `urls` (what the page requested) whose served code is the
 * case's own, wherever the compiler put it and under any id: its source map
 * names a file of the case directory `dir` (relative to the app root), or,
 * for code whose map names no file (a split text-only child is served with
 * an empty map), the case module `file`'s own graph imports it: a module
 * of the case directory or one whose map names a file of it imports it
 * (an import edge, static or dynamic), reached from the case module through
 * such modules only (never through a module of the harness
 * or another directory, a package or a virtual module of its own). A
 * module the dev server fails to serve is not the case's code, nor is a
 * package, the runtime or Vite's client. Observation only: the dev
 * server's served maps and module graph.
 */
export async function caseCode(
  hosts: HydrateHost,
  dir: string,
  file: string,
  urls: Array<string>,
): Promise<Array<string>> {
  // Vite's module ids, files and map sources are forward-slash paths (Windows too)
  const caseDir = `${normalizePath(path.join(hosts.start.root, dir))}/`
  const servedUrls = new Map<
    string,
    { mapped: boolean; empty: boolean } | undefined
  >()
  for (const url of urls) {
    if (!url.startsWith('/')) {
      continue
    }
    const served = await servedWithMap(hosts, url).catch(() => undefined)
    const sources = (served?.map?.sources ?? []).filter(
      (source): source is string => source !== null,
    )
    servedUrls.set(
      url,
      served && {
        mapped: sources.some((source) =>
          normalizePath(source).startsWith(caseDir),
        ),
        empty: sources.length === 0,
      },
    )
  }
  const mapped = new Set(
    [...servedUrls]
      .filter(([, served]) => served?.mapped)
      .map(([url]) => comparableUrl(url)),
  )
  const reached = caseGraph(hosts, `/${dir}/${file}`, caseDir, mapped)
  return [...servedUrls]
    .filter(
      ([url, served]) =>
        served !== undefined &&
        (served.mapped || (served.empty && reached.has(comparableUrl(url)))),
    )
    .map(([url]) => url)
}

/** A module URL without Vite's `t` (HMR timestamp) parameter. */
function comparableUrl(url: string) {
  const parsed = new URL(url, 'http://page.invalid')
  parsed.searchParams.delete('t')
  const query = parsed.searchParams.toString()
  return decodeURIComponent(parsed.pathname) + (query ? `?${query}` : '')
}

/**
 * The URLs of the modules the case module at `url` imports through the
 * case's own modules (static and dynamic imports, in the client module
 * graph): every module a case module imports, where a case module is the
 * module at `url`, a module of the case directory `caseDir` (any query) or
 * one of `mapped` (served code whose map names a file of it); of them,
 * the modules of the app and the virtual ones (a package is never case
 * code). The walk goes on only from case modules, so a module of the
 * harness or of another directory, a package or a virtual module adds
 * nothing it imports.
 */
function caseGraph(
  hosts: HydrateHost,
  url: string,
  caseDir: string,
  mapped: Set<string>,
): Set<string> {
  const graph = hosts.start.host.dev.vite.environments.client.moduleGraph
  const root = `${normalizePath(hosts.start.root)}/`
  const start = [
    ...(graph.getModulesByFile(
      normalizePath(path.join(hosts.start.root, url)),
    ) ?? []),
  ].filter((node) => node.url === url)
  const isCaseModule = (node: (typeof start)[number]) =>
    (node.file !== null && node.file.startsWith(caseDir)) ||
    mapped.has(comparableUrl(node.url))
  const reached = new Set<string>()
  const seen = new Set<unknown>(start)
  const queue = start.flatMap((node) => [...node.importedModules])
  while (queue.length > 0) {
    const node = queue.shift()!
    if (seen.has(node)) {
      continue
    }
    seen.add(node)
    // Modules of the app (not packages: workspace packages resolve outside
    // the app root, `node_modules` holds Vite's pre-bundled dependencies)
    // or virtual ones
    const appFile =
      node.file !== null &&
      node.file.startsWith(root) &&
      !/[\\/]node_modules[\\/]/.test(node.file)
    if (!appFile && !(node.id?.startsWith('\0') ?? false)) {
      continue
    }
    reached.add(comparableUrl(node.url))
    if (isCaseModule(node)) {
      queue.push(...node.importedModules)
    }
  }
  return reached
}

/**
 * The code and source map the client environment serves for a URL the page
 * requested (Vite's `transformRequest`, the dev server's own pipeline).
 */
export async function servedWithMap(hosts: HydrateHost, url: string) {
  const result =
    await hosts.start.host.dev.vite.environments.client.transformRequest(url)
  if (!result) {
    throw new Error(`the client environment serves nothing for ${url}`)
  }
  const map = result.map as { sources?: Array<string | null> } | null
  if (map?.sources) {
    // Sources are relative to the module's own location (the standard
    // reading of a source map); absolute paths are left as they are
    const file = hosts.start.host.file(url.split('?')[0]!.slice(1))
    map.sources = map.sources.map((source) =>
      source === null ? source : path.resolve(path.dirname(file), source),
    )
  }
  return { code: result.code, map }
}

/**
 * What the client environment serves for each module the page requested
 * once hydration started (the split code, wherever it lives), by URL.
 */
export async function lazyCode(hosts: HydrateHost, client: ClientRender) {
  const code: Record<string, string> = {}
  for (const url of client.lazyUrls) {
    if (url.startsWith('/') && !url.startsWith('/node_modules/')) {
      code[url] = await hosts.start.host.transform(url, 'client')
    }
  }
  return code
}

/** The page hydrated without a mismatch or an error. */
export function expectHydratedCleanly(client: ClientRender) {
  expect(client.recoverableErrors, 'recoverable hydration errors').toEqual([])
  expect(client.errors, 'page errors while hydrating').toEqual([])
}

/**
 * The page loaded the case's own code on demand once hydration started
 * (`ClientRender.chunks`): not just any module (a package, Vite's client).
 */
export function expectRenderedThroughChunks(
  client: Pick<ClientRender, 'chunks'>,
) {
  expect(
    client.chunks,
    'the case code the page requested once it hydrated',
  ).not.toEqual([])
}

/**
 * The client hydrates the server's HTML without an error or mismatch and,
 * once every gate opened, shows the markup the server rendered (the
 * hydration ids of the boundaries no other boundary contains included:
 * `ClientRender.outer`), and loaded code on demand (unless `split: false`: then
 * nothing is required of what loads). Returns the renders.
 */
export async function expectClientRendersLikeServer(
  hosts: HydrateHost,
  code: string,
  options: ClientOptions & { split?: boolean } = {},
) {
  const client = await renderClient(hosts, code, options)
  expectHydratedCleanly(client)
  expect(client.outer, 'the hydrated page').toBe(client.serverOuter)
  if (options.split !== false) {
    expectRenderedThroughChunks(client)
  }
  return { server: client.server, client }
}

/**
 * `expectClientRendersLikeServer`, and the server's markup is the markup
 * the uncompiled source renders (hydration ids blanked).
 */
export async function expectRendersLikeSource(
  hosts: HydrateHost,
  code: string,
  options: ClientOptions & { split?: boolean } = {},
) {
  const source = await renderSource(hosts, code, options)
  const rendered = await expectClientRendersLikeServer(hosts, code, options)
  expect(withoutHydrationIds(rendered.server.html), 'the server markup').toBe(
    source.html,
  )
  return { source, ...rendered }
}

/** What mounting a Solid case in the page gave (`SolidHost.mount`). */
export interface SolidMount {
  case: StartCase
  /** The normalized markup of the container once every gate opened. */
  html: string
  /** `console.error` output and uncaught errors of the page during the run. */
  errors: Array<string>
  /** What the page requested once the mount started (paths with query). */
  lazy: Array<string>
  /** `StartCase.loads()` of the module (client graph, static and dynamic). */
  loads: Array<string>
  /** `StartCase.serverLoads()` of the module. */
  serverLoads: Array<string>
}

/** A Solid Start host (`vite-plugin-solid`) whose page mounts a module. */
export interface SolidHost {
  start: StartHost
  /**
   * Writes `code` (and `files`) as a case of the Solid app, checks that the
   * client and SSR environments serve it and the SSR environment evaluates
   * it, then mounts `<Page />` in the page (Solid's `render`: the boundary
   * appears after startup), opens every gate and waits until it is quiet.
   */
  mount: (code: string, files?: Record<string, string>) => Promise<SolidMount>
}

/**
 * One Solid Start host per test file, created on first use and closed after
 * the file's tests.
 */
export function useSolidHost(): () => Promise<SolidHost> {
  let started: Promise<StartHost> | undefined
  afterAll(async () => {
    await (await started)?.close()
  })
  return async () => {
    started ??= createStartHost({
      framework: 'solid',
      start: startOptions,
      files: {
        'tsconfig.json': appTsconfig({
          jsx: 'preserve',
          jsxImportSource: 'solid-js',
        }),
        'src/harness/solid.client.tsx': `export { createComponent, render } from 'solid-js/web'
`,
      },
    })
    const start = await started
    return {
      start,
      mount: async (code, files = {}) => {
        const startCase = await start.case({
          'setup.ts': 'export {}\n',
          ...Object.fromEntries(
            Object.entries(files).map(([name, source]) => [
              caseFileName(name),
              source,
            ]),
          ),
          'module.tsx': code,
        })
        await startCase.served('module.tsx', 'client')
        await startCase.served('module.tsx', 'ssr')
        await startCase.ssr()
        const run = await startCase.client<{
          html: string
          lazy: Array<string>
        }>(
          `performance.setResourceTimingBufferSize(100000)
const glue = await import('/src/harness/solid.client.tsx')
const m = await load('module.tsx')
const root = document.createElement('div')
document.body.append(root)
${normalizeSource}
${settleSource}
const before = performance.getEntriesByType('resource').length
const dispose = glue.render(() => glue.createComponent(m.Page, {}), root)
try {
  await settled()
  await openGates()
  return {
    html: normalize(root.innerHTML),
    lazy: performance.getEntriesByType('resource').slice(before).map((entry) => {
      const url = new URL(entry.name)
      return url.origin === location.origin ? decodeURIComponent(url.pathname) + url.search : entry.name
    }),
  }
} finally {
  dispose()
  root.remove()
}`,
          { file: 'setup.ts' },
        )
        return {
          case: startCase,
          html: run.result.html,
          errors: run.errors,
          lazy: run.result.lazy,
          loads: await startCase.loads(),
          serverLoads: await startCase.serverLoads(),
        }
      },
    }
  }
}
