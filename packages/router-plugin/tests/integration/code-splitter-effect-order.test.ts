/**
 * The order of effects between top-level declarations, real builds (Vite
 * and Rspack client builds, mounted in a DOM): a statement using an export
 * and a binding only split code reads runs when the route module loads, in
 * source order; an effectful declaration two split options read runs once,
 * when the first of their chunks loads.
 */
import { describe, expect, test } from 'vitest'
import { build, head, routeApp } from '../build-harness'

const libs = {
  // what a shared module's effects record
  'link.ts': `export function make(mark: string) {
  ;((globalThis as any).__runs ??= []).push('make')
  return { mark }
}
`,
}

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  // A statement using an export and a `let` the component's code reads
  // once followed the export into its module, which then read the `let` of
  // the route module at its evaluation (found by fuzzing)
  test('a statement using an export and a binding only split code reads runs when the route module loads, in source order', async () => {
    const app = await build({
      bundler,
      env: 'client',
      minify: false,
      files: routeApp(
        `${head}import '../globals'
declare global {
  var fmt: (...a: Array<unknown>) => number
  var log: (tag: string, ...a: Array<unknown>) => unknown
}
export function Ex2() { return <i>Ex2:{globalThis.fmt(1)}</i> }
let l4: unknown = globalThis.fmt(2)
l4 = globalThis.log('T2', l4)
async function f5(x?: unknown) { return globalThis.fmt(x, l4) }
globalThis.log('T5', l4, Ex2)
const P8 = () => <div>P8:{globalThis.fmt(3)}<Ex2 /></div>
export const Route = createFileRoute('/')({
  component: () => <b>I:{globalThis.fmt(P8, f5)}</b>,
})
`,
        {
          env: 'client',
          files: {
            ...libs,
            'globals.ts': `const g = globalThis as any
g.__effects = []
g.fmt = (...a: Array<unknown>) => a.length
g.log = (tag: string, ...a: Array<unknown>) => {
  g.__effects.push([tag, ...a.map((x) => typeof x)].join(':'))
  return a[0]
}
`,
          },
        },
      ),
    })
    try {
      const run = await app.run(
        'const atLoad = [...globalThis.__effects]\nawait entry.mount(entry.Route.options.component)\nreturn atLoad',
      )
      expect(run.result).toEqual(['T2:number', 'T5:number:function'])
      expect((run.html as string).replace(/<[^>]*>/g, '')).toBe('I:2')
    } finally {
      await app.dispose()
    }
  })
})

describe.each(['vite', 'rspack'] as const)(
  'shared effects, a %s build',
  (bundler) => {
    // An effectful declaration two split options read goes to one lazy
    // shared module both chunks import: the effect runs once, when the
    // first of them loads, whichever it is
    test.each([
      [
        'an effectful declaration two split options read',
        `import { make } from '../link'
const x = make('MARK_SHARED_X')
export const Route = createFileRoute('/')({
  component: () => <p>{x.mark}</p>,
  errorComponent: () => <p>{x.mark}</p>,
})
`,
        'make',
      ],
    ])(
      '%s runs once, when the first of their chunks loads, whichever',
      async (_, body, effect) => {
        const app = await build({
          bundler,
          env: 'client',
          minify: false,
          files: routeApp(`${head}${body}`, { env: 'client', files: libs }),
        })
        try {
          expect(app.where(/MARK_SHARED_[ABX]/)).toBe('lazy')
          for (const first of ['component', 'errorComponent']) {
            const second =
              first === 'component' ? 'errorComponent' : 'component'
            const run = await app.run(
              `const before = [...(globalThis.__runs ?? [])]
await entry.Route.options.${first}.preload()
const mid = [...globalThis.__runs]
await entry.Route.options.${second}.preload()
return [before, mid, [...globalThis.__runs]]`,
            )
            expect(run.result, first).toEqual([[], [effect], [effect]])
          }
        } finally {
          await app.dispose()
        }
      },
    )
  },
)
