/**
 * Module state and identity behind exported bindings a split chunk copies
 * or imports (SPEC J2.4 "One instance": a chunk copies an exported binding
 * only when the copy is a closure of functions and primitive constants
 * nothing writes; a class, an object, a call result, a regex, a written
 * binding, state, effects and augmented bindings exist once). Real
 * production builds, output executed: the split options of one route, an
 * importer of the route file, or both, drive the exported bindings and the
 * test observes what their shared state does (a subscriber fires, a
 * counter counts, `instanceof` holds, a Provider's value reaches a
 * consumer, a sentinel compares equal). Dev folds the extraction of
 * exports back into the route module, so only a build shows where an
 * extracted module and a chunk would each get their own copy of what a
 * copied export reads: the dev twin (`pages/`) runs the same routes.
 * Source: external review 2 of the compiler rewrite, findings 1–3.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { tanstackRouter } from '../../src/vite'
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
// `listeners` is written only through member calls, so it never joins the
// functions' cluster; it is in their reach, so neither function is copied
// and the one array lives in the route module: each chunk and each
// importer of the route file subscribes to and emits on the same list.
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

// ---- identity of exported classes, contexts and objects the chunk imports -----
// A class, an annotated call and a literal have an identity: the chunk
// imports them from the extracted module, which also serves importers of
// the route file, so `instanceof`, a Provider's value and a sentinel hold
// across the route's chunks and its importers. A function returning the
// sentinel reaches it and is not copied either.
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

// ---- finding 3: forms of mutation --------------------------------------------
/**
 * A route whose split component mutates module state through an exported
 * `bump()` written as `mutation`; an importer reads it through the
 * exported `read()`. One state: the importer reads what the chunk wrote.
 */
const mutated = (
  name: string,
  decl: string,
  mutation: string,
  read: string,
): Case => ({
  name: `the importer reads what the split component wrote through ${name}`,
  route: `${decl}
export function bump() {
  ${mutation}
}
export function read() {
  return ${read}
}
function Page() {
  bump()
  return <p>{read()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
  reexports: 'read',
  script: `const html = ${renderComponent}
return [html, entry.read()]`,
  expected: ['<p>1</p>', 1],
})

// The mutation model is syntactic (`this.n++` in a method, an alias, a
// call, `Reflect.set` are no writes of the binding), and it need not be
// complete here: the state is an object, an array, a class or a Map in
// every form, so the function reaching it is not copied and the state
// exists once, whatever form the write takes.
const obj = `const state = { n: 0 }`
const arr = `const x: Array<number> = []`
const mutations: Array<Case> = [
  mutated(
    'a method writing this',
    `export const counter = { n: 0, inc() { this.n++ } }`,
    `counter.inc()`,
    `counter.n`,
  ),
  mutated(
    'a static method writing this',
    `export class S {
  static n = 0
  static inc() {
    this.n++
  }
}`,
    `S.inc()`,
    `S.n`,
  ),
  mutated('an alias', obj, `const s = state\n  s.n++`, `state.n`),
  mutated(
    'a function it is passed to',
    `${obj}
function mutate(o: { n: number }) {
  o.n++
}`,
    `mutate(state)`,
    `state.n`,
  ),
  mutated(
    'Reflect.set',
    obj,
    `Reflect.set(state, 'n', state.n + 1)`,
    `state.n`,
  ),
  mutated('push.apply', arr, `x.push.apply(x, [1])`, `x.length`),
  mutated(
    'a nested member',
    `const state = { list: [] as Array<number> }`,
    `state.list.push(1)`,
    `state.list.length`,
  ),
  mutated(
    'Array.prototype.push.call',
    arr,
    `Array.prototype.push.call(x, 1)`,
    `x.length`,
  ),
  mutated('a computed method name', arr, `x['push'](1)`, `x.length`),
  mutated(
    'a method of the literal naming the binding',
    `const store = { items: [] as Array<number>, add() { store.items.push(1) } }`,
    `store.add()`,
    `store.items.length`,
  ),
  // forms the mutation model names
  mutated('a member write', obj, `state.n++`, `state.n`),
  mutated(
    'Object.assign',
    obj,
    `Object.assign(state, { n: state.n + 1 })`,
    `state.n`,
  ),
  mutated(
    'a computed member write',
    obj,
    `for (const k of ['n'] as const) {\n    state[k]++\n  }`,
    `state.n`,
  ),
  mutated('a reassigned let', `let n = 0`, `n++`, `n`),
  mutated(
    'a Map set',
    `const m = new Map<string, number>()`,
    `m.set('a', 1)`,
    `m.size`,
  ),
]

// ---- runners ------------------------------------------------------------------
type Runner = { name: string; run: (c: Case) => Promise<unknown> }

async function viteCurrent(c: Case, env: 'ssr' | 'client' = 'ssr') {
  const app = await build({
    bundler: 'vite',
    env,
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
  { name: 'vite 8', run: (c) => viteCurrent(c) },
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

describe('private module state behind exported functions the chunk imports', () => {
  for (const { name, run } of runners) {
    suite(name, moduleState, run)
  }
})

describe('identity of exported bindings the chunk imports', () => {
  for (const { name, run } of runners) {
    suite(name, identity, run)
  }
})

suite(
  'forms of mutation of module state the split component reaches',
  mutations,
  (c) => viteCurrent(c),
)

// ---- where a non-copied export lands ------------------------------------------
// An exported function over module state is not copied: the chunk imports
// its extracted module (R77 amendment). That module is reachable from the
// entry (the route module re-exports it) and from the chunk; the copy rule
// exists because Rolldown < 1.1.5 and a user `manualChunks` group merging
// into the entry placed such a module with the entry (tanstack.com). Where
// it lands today, plain and under that group, says whether that reason
// still holds for what is not copied.
describe('where a non-copied export (one over module state) lands', () => {
  const files = filesOf({
    name: '',
    route: `let count = 0
export function next() {
  return 'MARK_NEXT_END' + ++count
}
function Page() {
  return <p>{next()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    script: '',
    expected: undefined,
  })
  const tanstackGroup = /node_modules[\\/]@tanstack[\\/]/
  const configs = [
    { name: 'vite', group: false },
    {
      name: 'vite with a manualChunks group of the TanStack packages',
      group: true,
    },
  ]
  for (const { name, group } of configs) {
    test(
      `${name}: it loads with the chunk`,
      async () => {
        const app = await build({
          bundler: 'vite',
          env: 'client',
          files,
          routerPlugins: group
            ? (config) => [
                tanstackRouter(config),
                {
                  name: 'test:chunks',
                  config: () => ({
                    build: {
                      rollupOptions: {
                        output: {
                          manualChunks: (id: string) =>
                            tanstackGroup.test(id) ? 'tanstack' : undefined,
                        },
                      },
                    },
                  }),
                },
              ]
            : undefined,
        })
        try {
          expect((await app.run(`return ${renderComponent}`)).result).toBe(
            '<p>MARK_NEXT_END1</p>',
          )
          expect(app.where('MARK_NEXT_END')).toBe('lazy')
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )
  }
})
