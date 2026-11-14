/**
 * When an effect that sets state only the split component reads runs, on
 * the Vite dev server (`route-app.ts`): the same whether the module writes
 * the state in its declaration (`let calls = seed()`) or in a statement
 * after it (`calls = seed()`, `calls += seed()`). Moving an initialiser to
 * a lazy chunk is allowed (G3; DECISIONS R29/R31), so either may run at load
 * or at the first render, but both run at the same time, once, with the
 * value the code gives. A write of a pure value is the control. Builds are
 * in integration/code-splitter-effect-timing.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { head, loadRoute } from './route-app'

// (a global function the setup defines: a method of `globalThis` would be
// a change of a global, which keeps a statement in the route module and not
// a declaration: R146 amendment)
const shapes = {
  initialiser: `let calls = seed()`,
  assignment: `let calls = 0\ncalls = seed()`,
  'compound assignment': `let calls = 0\ncalls += seed()`,
  'pure value (control)': `let calls = 0\ncalls = 5`,
}

/** The effect's runs at load and after the first render, the render, and the reports. */
async function observe(code: string) {
  const route = await loadRoute(`${head}${code}
export const Route = createFileRoute('/')({ component: () => <p>{String(calls)}</p> })
`)
  const run = await route.run<{
    atLoad: number
    after: number
    html: string
  }>(
    `const atLoad = globalThis.seeds
const html = await render('component')
return { atLoad, after: globalThis.seeds, html }`,
    {
      before: `globalThis.seeds = 0; globalThis.seed = () => ++globalThis.seeds`,
    },
  )
  // warnings and errors since the route was written
  const reports = findDiagnostics(await route.diagnostics(), {}).length
  return { ...run, reports }
}

describe('on the Vite dev server, an effect setting state only the split component reads', () => {
  it('runs nothing for a pure value (control)', async () => {
    expect(await observe(shapes['pure value (control)'])).toMatchObject({
      atLoad: 0,
      after: 0,
      html: '<p>5</p>',
    })
  })
})

// A decorator runs user code when its class is defined (TypeScript
// `experimentalDecorators`, as dependency injection libraries use them, on a
// parameter as on the class): a class carrying one is an effect, which has no
// order with the effects after it (no order rule): it runs when the split
// component loads.
describe.each([
  [
    'a constructor parameter',
    `class Service {\n  constructor(@Inject() readonly dep: unknown) {}\n}`,
  ],
  [
    'a method parameter',
    `class Service {\n  constructor(readonly dep: unknown) {}\n  with(@Inject() other: unknown) { return other }\n}`,
  ],
  [
    'the class (control)',
    `@Register()\nclass Service {\n  constructor(readonly dep: unknown) {}\n}`,
  ],
])(
  'on the Vite dev server, a class only the split component uses with a decorator on %s',
  (_name, declaration) => {
    it('runs its decorator when the component loads, after the effects written after it', async () => {
      const route = await loadRoute(
        `${head}import { Inject, Register } from './di'
${declaration}
;(globalThis as any).seed('after')
export const Route = createFileRoute('/')({
  component: () => <p>{String(new Service(1).dep)}</p>,
})
`,
        {
          tsconfig: { experimentalDecorators: true },
          files: {
            'di.ts': `export const Inject = () => (_target: unknown, _key: unknown, _index: number) => {
  ;(globalThis as any).seed('decorator')
}
export const Register = () => (_target: unknown) => {
  ;(globalThis as any).seed('decorator')
}
`,
          },
        },
      )
      const run = await route.run<{
        atLoad: Array<string>
        html: string
        after: Array<string>
      }>(
        `const atLoad = [...globalThis.seeded]
const html = await render('component')
return { atLoad, html, after: [...globalThis.seeded] }`,
        {
          before: `globalThis.seeded = []; globalThis.seed = (name) => globalThis.seeded.push(name)`,
        },
      )
      expect(run).toEqual({
        atLoad: ['after'],
        html: '<p>1</p>',
        after: ['after', 'decorator'],
      })
    })
  },
)

// A value the module computes at load keeps the value it had there when only
// the split component reads it (DESIGN §3.4.3, R7): it may move to the chunk
// only when nothing changes what it read, or what it wrote, between its place
// in the module and the chunk's evaluation. The function it calls may write
// state the route module keeps, may run its read before a later write, or may
// read state that code which does not run where it is written changes later.
describe('on the Vite dev server, a value computed at load that only the split component reads', () => {
  it.each([
    [
      'a function it calls assigns state the loader reads',
      `let mode = 'idle'
function init() {
  mode = 'ready'
  return 1
}
const thing = init()
export const Route = createFileRoute('/')({
  loader: () => mode,
  component: () => <p>{String(thing)}</p>,
})`,
      // `thing` and `init` move to the chunk, which holds its own `mode`
      // (`main` shares only names two option groups read; an assignment is
      // no read): the loader reads the route module's, as on `main`, which
      // gives another value than the source here
      { loader: 'idle', html: '<p>1</p>' },
    ],
  ])(
    "gives `main`'s value, not the source's, when %s",
    async (_name, code, expected) => {
      const route = await loadRoute(`${head}${code}\n`)
      const run = await route.run<{ loader: unknown; html: string }>(
        `const loader = await options.loader()
await null
const html = await render('component')
return { loader, html }`,
      )
      expect(run).toEqual(expected)
    },
  )
})

// A destructuring default or computed key runs user code when the
// declaration evaluates, like an initialiser does (`const beta = flags.beta
// ?? track()`): it has no order with the effects after it (no order rule),
// it runs when the split component loads.
describe.each([
  [
    'an object pattern default',
    `const { beta = track('beta') } = {} as { beta?: string }`,
  ],
  [
    'an array pattern default',
    `const [beta = track('beta')] = [] as Array<string>`,
  ],
  [
    'a computed key',
    `const { [track('beta')]: beta } = { beta: 'beta' } as Record<string, string>`,
  ],
])(
  'on the Vite dev server, %s only the split component reads',
  (_name, declaration) => {
    it('runs when the component loads, after the effects written after it', async () => {
      const route = await loadRoute(
        `${head}import { track } from './analytics'
${declaration}
track('after')
export const Route = createFileRoute('/')({
  component: () => <p>{String(beta)}</p>,
})
`,
        {
          files: {
            'analytics.ts': `export const track = (name: string) => {
  ;(globalThis as any).seed(name)
  return name
}
`,
          },
        },
      )
      const run = await route.run<{
        atLoad: Array<string>
        html: string
        after: Array<string>
      }>(
        `const atLoad = [...globalThis.seeded]
const html = await render('component')
return { atLoad, html, after: [...globalThis.seeded] }`,
        {
          before: `globalThis.seeded = []; globalThis.seed = (name) => globalThis.seeded.push(name)`,
        },
      )
      expect(run).toEqual({
        atLoad: ['after'],
        html: '<p>beta</p>',
        after: ['after', 'beta'],
      })
    })
  },
)
