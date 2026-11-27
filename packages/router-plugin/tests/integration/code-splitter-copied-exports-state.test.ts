/**
 * Module state and identity behind exported bindings a split chunk copies
 * or imports (as on `main`, spec-main-splitting 1.6: a chunk imports what
 * `export const|let|var` declares and copies the other exported
 * declarations it reads). Real production builds, output executed: the
 * split options of one route, an importer of the route file, or both,
 * drive the exported bindings and the test observes what their shared
 * state does (a subscriber fires, a counter counts, `instanceof` holds, a
 * Provider's value reaches a consumer, a sentinel compares equal). The dev
 * twin (`pages/`) runs the same routes.
 * Source: external review 2 of the compiler rewrite, findings 1–2.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { tanstackRouter } from '../../src/vite'
import { batchCases } from '../batch-build'
import { build, buildWithRsbuild, head, rootRoute } from '../build-harness'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const timeout = 120_000

/**
 * The entry: the route, the exports of the route file the test names
 * (`reexports`: an importer of the route file), and `render(component,
 * props)`, which preloads a component and renders it to a string (in Node
 * for SSR builds, in the browser for client builds).
 */
const entryOf = (reexports?: string) => `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
${reexports ? `export { ${reexports} } from './routes/index'` : ''}
export async function render(component: any, props?: any) {
  await component.preload?.()
  return renderToString(createElement(component, props))
}
`

type Case = {
  name: string
  route: string
  files?: Record<string, string>
  /** Exports of the route file the entry re-exports (an importer). */
  reexports?: string
  /** Async function body; `entry` holds the entry's exports. */
  script: string
  expected: unknown
}

const filesOf = (c: Case) => ({
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': `${head}${c.route}`,
  'entry.ts': entryOf(c.reexports),
  ...c.files,
})

const fire = `() => {
    ;(globalThis.__fired = (globalThis.__fired ?? 0) + 1)
  }`

/** Private module state behind two exported accessors, one per split option. */
const listeners = `const listeners: Array<() => void> = []
export function subscribe(fn: () => void) {
  listeners.push(fn)
}
export function emit() {
  listeners.forEach((fn) => fn())
}
function Page() {
  subscribe(${fire})
  return <p>subscribed</p>
}
function Failed() {
  emit()
  return <p>emitted</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: Failed,
})
`

/** An exported class the component throws and the errorComponent tests. */
const thrownClass = `export class NotAllowed extends Error {}
function Page(): never {
  throw new NotAllowed('no')
}
function Failed({ error }: { error: unknown }) {
  return <p>{String(error instanceof NotAllowed)}</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: Failed,
})
`

const renderComponent = `await entry.render(entry.Route.options.component)`
const renderError = `await entry.render(entry.Route.options.errorComponent, { error: new Error('x') })`
const catchComponent = `let caught
try {
  ${renderComponent}
} catch (error) {
  caught = error
}`

// ---- private mutable state behind exported functions the chunk imports ----------
// The component and the error component read the functions and `listeners`:
// names two split options read are shared (as on `main`), so the one array
// lives in the route module and each chunk and each importer of the route
// file subscribes to and emits on the same list.
const moduleState: Array<Case> = [
  {
    name: 'two split options share the private state their exported accessors close over',
    route: listeners,
    script: `const a = ${renderComponent}
const b = ${renderError}
return [a, b, globalThis.__fired ?? 0]`,
    expected: ['<p>subscribed</p>', '<p>emitted</p>', 1],
  },
  {
    name: 'an importer of the route file and a split option share it',
    route: listeners,
    reexports: 'subscribe',
    script: `entry.subscribe(${fire})
const b = ${renderError}
return [b, globalThis.__fired ?? 0]`,
    expected: ['<p>emitted</p>', 1],
  },
  {
    name: 'two importer-side calls through the route file share it',
    route: listeners,
    reexports: 'subscribe, emit',
    script: `entry.subscribe(${fire})
entry.emit()
return globalThis.__fired ?? 0`,
    expected: 1,
  },
]

/** How the split component compares an exported function sentinel. */
const sentinelUses: Array<[string, string]> = [
  ['compared by `===`', 'return cb === DEFAULT'],
  [
    'used as a case label',
    'switch (cb) {\n    case DEFAULT:\n      return true\n    default:\n      return false\n  }',
  ],
]

// ---- identity of exported classes, contexts and objects the chunk imports -----
// A class, an annotated call and a literal have an identity: where `main`
// imports them (an `export const`, a name two split options read), the
// chunk imports them from the route module, which also serves importers of
// the route file, so `instanceof`, a Provider's value and a sentinel hold
// across the route's chunks and its importers.
const identity: Array<Case> = [
  {
    name: 'a thrown exported class is recognised by instanceof in the errorComponent chunk',
    route: thrownClass,
    script: `${catchComponent}
return await entry.render(entry.Route.options.errorComponent, { error: caught })`,
    expected: '<p>true</p>',
  },
  {
    name: 'a thrown exported class is recognised by instanceof in an importer of the route file',
    route: thrownClass,
    reexports: 'NotAllowed',
    script: `${catchComponent}
return caught instanceof entry.NotAllowed`,
    expected: true,
  },
  {
    name: 'a @__PURE__ context the route component provides reaches a consumer importing it from the route file',
    route: `import { createContext } from 'react'
import { Child } from '../child'
export const Ctx = /* @__PURE__ */ createContext('default')
function Page() {
  return (
    <Ctx.Provider value="provided">
      <Child />
    </Ctx.Provider>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`,
    files: {
      'child.tsx': `import { useContext } from 'react'
import { Ctx } from './routes/index'
export function Child() {
  return <b>{useContext(Ctx)}</b>
}
`,
    },
    script: `return ${renderComponent}`,
    expected: '<b>provided</b>',
  },
  {
    // control: without the annotation the call is effectful, one instance
    name: 'a context the route component provides reaches a consumer importing it from the route file',
    route: `import { createContext } from 'react'
import { Child } from '../child'
export const Ctx = createContext('default')
function Page() {
  return (
    <Ctx.Provider value="provided">
      <Child />
    </Ctx.Provider>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`,
    files: {
      'child.tsx': `import { useContext } from 'react'
import { Ctx } from './routes/index'
export function Child() {
  return <b>{useContext(Ctx)}</b>
}
`,
    },
    script: `return ${renderComponent}`,
    expected: '<b>provided</b>',
  },
  {
    name: 'an exported sentinel an exported function returns compares equal through the route file',
    route: `export const EMPTY: ReadonlyArray<string> = []
export function pick(list: ReadonlyArray<string>) {
  return list.length === 0 ? EMPTY : list
}
function Page() {
  return <p>{String(pick([]) === EMPTY)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    reexports: 'EMPTY, pick',
    script: `const html = ${renderComponent}
return [html, entry.pick([]) === entry.EMPTY]`,
    expected: ['<p>true</p>', true],
  },
  {
    // a function used as a constructor has an identity (its prototype)
    name: 'an exported constructor function is recognised by instanceof in an importer of the route file',
    route: `export function Point(this: any, x: number) {
  this.x = x
}
export function isPoint(v: unknown) {
  return v instanceof Point
}
function Page() {
  return <p>{String(isPoint(new (Point as any)(1)))}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    reexports: 'Point, isPoint',
    script: `const html = ${renderComponent}
return [html, entry.isPoint(new entry.Point(1))]`,
    expected: ['<p>true</p>', true],
  },
  {
    // a function compared by identity is a sentinel
    name: 'an exported function sentinel compares equal through two exports of the route file',
    route: `export const DEFAULT = () => {}
export function isDefault(cb: unknown) {
  return cb === DEFAULT
}
function Page() {
  return <p>{String(isDefault(DEFAULT))}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    reexports: 'DEFAULT, isDefault',
    script: `const html = ${renderComponent}
return [html, entry.isDefault(entry.DEFAULT)]`,
    expected: ['<p>true</p>', true],
  },
  ...sentinelUses.map(
    ([how, body]): Case => ({
      // the component compares what an importer of the route file passes
      name: `an exported function sentinel ${how} in the split component matches the instance an importer of the route file passes`,
      route: `export const DEFAULT = () => {}
function isDefault(cb: unknown) {
  ${body}
}
function Page({ cb }: { cb: unknown }) {
  return <p>{String(isDefault(cb))}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      reexports: 'DEFAULT',
      script: `return await entry.render(entry.Route.options.component, { cb: entry.DEFAULT })`,
      expected: '<p>true</p>',
    }),
  ),
  {
    // a copied function another export of the route file holds is the
    // importer's instance of it
    name: "a copied exported function held by an exported object is the importer's instance",
    route: `export function helper() {
  return 1
}
export const config = { helper }
function Page() {
  return <p>{config.helper() + helper()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    reexports: 'helper, config',
    script: `const html = ${renderComponent}
return [html, entry.config.helper === entry.helper]`,
    expected: ['<p>2</p>', true],
  },
  {
    // control: a Map something `set`s is state, one instance
    name: 'an exported registry the split component and an importer fill is one Map',
    route: `export const registry = new Map<string, number>()
export function register(key: string) {
  registry.set(key, 1)
}
function Page() {
  register('page')
  return <p>{registry.size}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    reexports: 'registry, register',
    script: `entry.register('entry')
const html = ${renderComponent}
return [html, entry.registry.size]`,
    expected: ['<p>2</p>', 2],
  },
]

// ---- runners ------------------------------------------------------------------
type Runner = { name: string; run: (c: Case) => Promise<unknown> }

/**
 * Vite 8: one production SSR build of every case (`batchCases`); each
 * case's script runs in a Node process of its own, on its case's entry.
 */
function viteBatch(cases: Array<Case>): Runner['run'] {
  const add = batchCases({
    bundler: 'vite',
    env: 'ssr',
    minify: false,
    prefix: '.copied-exports-',
  })
  const batched = new Map(
    cases.map((c) => [
      c,
      add({
        name: c.name,
        route: `${head}${c.route}`,
        entry: entryOf(c.reexports),
        files: c.files,
      }),
    ]),
  )
  return async (c) => (await (await batched.get(c)!()).run(c.script)).result
}

const bundler = (name: 'rspack' | 'webpack') => async (c: Case) => {
  const app = await build({
    bundler: name,
    env: 'ssr',
    minify: false,
    prefix: '.copied-exports-',
    files: filesOf(c),
  })
  try {
    return (await app.run(c.script)).result
  } finally {
    await app.dispose()
  }
}

async function rsbuild(c: Case) {
  const app = await buildWithRsbuild({ files: filesOf(c) })
  return (await app.run(c.script)).result
}

/** Vite 7 (Rollup): the plugin on the aliased package, a production SSR build run in Node. */
async function vite7(c: Case) {
  const vite = await viteVersions.find((v) => v.major === 7)!.load()
  const app = await createApp({
    dir: harnessDir,
    prefix: '.copied-exports-vite7-',
    files: filesOf(c),
    packageJson: { type: 'module' },
    registerCleanup: onTestFinished,
  })
  const outDir = path.join(app.root, 'dist')
  await vite.build({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: path.join(app.root, 'routes'),
        generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
        codeSplittingOptions: { addHmr: false },
      }),
    ],
    esbuild: { jsx: 'automatic' },
    build: {
      ssr: 'entry.ts',
      outDir,
      minify: false,
      rollupOptions: { output: { entryFileNames: 'entry.js' } },
    },
  })
  const { stdout } = await runNodeProgram(
    `const entry = await import(${JSON.stringify(path.join(outDir, 'entry.js'))})
const result = await (async () => { ${c.script} })()
console.log(JSON.stringify(result ?? null))`,
    { cwd: app.root },
  )
  return JSON.parse(stdout.trim().split('\n').at(-1)!)
}

const runners: Array<Runner> = [
  { name: 'vite 8', run: viteBatch([...moduleState, ...identity]) },
  { name: 'vite 7', run: vite7 },
  { name: 'rspack', run: bundler('rspack') },
  { name: 'webpack', run: bundler('webpack') },
  { name: 'rsbuild', run: rsbuild },
]

/** One test per case. */
const suite = (
  title: string,
  cases: Array<Case>,
  run: (c: Case) => Promise<unknown>,
) =>
  describe(title, () => {
    for (const c of cases) {
      test(
        c.name,
        async () => {
          expect(await run(c)).toEqual(c.expected)
        },
        timeout,
      )
    }
  })

// Every case on Vite 8, one case of each list on the other bundlers: what
// state a chunk shares is the compiler's decision, the same for every host.
const casesOn = (name: string, cases: Array<Case>) =>
  name === 'vite 8' ? cases : cases.slice(0, 1)

describe('private module state behind exported functions the chunk imports', () => {
  for (const { name, run } of runners) {
    suite(name, casesOn(name, moduleState), run)
  }
})

describe('identity of exported bindings the chunk imports', () => {
  for (const { name, run } of runners) {
    suite(name, casesOn(name, identity), run)
  }
})
