/**
 * State read or written through another name, real builds (Vite and Rspack
 * client builds, mounted in a DOM). A read through an alias, a holder or a
 * spread reads the object the other name names: it keeps the value the
 * source reads although the write is to the original binding (REVIEW
 * design 2 step 4, finding 1). A call of a method named like an array's
 * mutator (`push`, `set`, `add`) on an object the module defines runs that
 * object's code: it keeps its order with the effects after it (finding 2).
 * A write through another name (an alias, a holder) writes the object that
 * name holds: a read of it through its first name keeps the value the
 * source reads (REVIEW design 2 final, finding 1).
 */
import { describe, expect, test } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

const entry = `${clientMountEntry}
export const effects = () => (globalThis as any).__effects
`

async function mounted(
  bundler: 'vite' | 'rspack',
  route: string,
  /** Call `beforeLoad` first, as a navigation does. */
  load = false,
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, {
      env: 'client',
      files: {
        'entry.ts': entry,
        'track.ts': `export function track(name: string) {
  ;((globalThis as any).__effects ??= []).push(name)
}
`,
      },
    }),
  })
  try {
    const run = await app.run(`const atLoad = [...(entry.effects() ?? [])]
${load ? 'entry.Route.options.beforeLoad()\n' : ''}await entry.mount(entry.Route.options.component)
return { atLoad, after: entry.effects() ?? [] }`)
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      ...(run.result as { atLoad: Array<string>; after: Array<string> }),
    }
  } finally {
    await app.dispose()
  }
}

const route = (decls: string, options: string) =>
  `${head}import { track } from '../track'
${decls}
export const Route = createFileRoute('/')({
${options}
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    ['an alias', 'const alias = cfg\nconst y = alias.v'],
    ['a holder', 'const holder = { cfg }\nconst y = holder.cfg.v'],
    ['an array holding it', 'const all = [cfg]\nconst y = all[0].v'],
    ['a spread of an alias', 'const alias = cfg\nconst y = { ...alias }.v'],
    [
      'a destructuring of an alias',
      'const alias = cfg\nconst { v: y } = alias',
    ],
  ])(
    'a read through %s before a write of the original keeps the value the source reads',
    async (_, reader) => {
      const r = await mounted(
        bundler,
        route(
          `const cfg = { v: 'OLD' }\n${reader}\ncfg.v = 'NEW'`,
          '  beforeLoad: () => cfg,\n  component: () => <p>{y}</p>,',
        ),
      )
      expect(r.text).toBe('OLD')
    },
    timeout,
  )

  test.each([
    [
      'a destructuring before a write through an alias',
      'const { v: y } = cfg\nconst alias = cfg\nalias.v = 11',
    ],
    [
      'a pure call before a write through a holder',
      'const y = /* @__PURE__ */ snap(cfg)\nconst holder = { c: cfg }\nholder.c.v = 11',
    ],
  ])(
    'a read of %s keeps the value the source reads',
    async (_, decls) => {
      const r = await mounted(
        bundler,
        route(
          `const snap = (o: { v: number }) => String(o.v)\nconst cfg = { v: 1 }\n${decls}`,
          '  beforeLoad: () => cfg,\n  component: () => <p>{y}</p>,',
        ),
      )
      expect(r.text).toBe('1')
    },
    timeout,
  )

  // round tools, placement-exec seeds 13017, 1302957, 1310446, 1604480
  // (toy planner) and 1300510 (router planner, Vue): the component writes
  // through the holder too; the read stays before the later write
  test.each([
    ['a function', 'function Page() { h6.c.v = 12; return <p>{r11[0]}</p> }'],
    [
      'a wrapped function',
      'hoc(function Page() { h6.c.v = 12; return <p>{r11[0]}</p> })',
    ],
  ])(
    'a read through a holder before a later write of the original keeps the value the source reads when the component (%s) writes through the holder',
    async (_, component) => {
      const r = await mounted(
        bundler,
        route(
          'const hoc = <T,>(f: T): T => f\nconst o0 = { v: 1 }\nconst h6 = { c: o0 }\nconst r11 = [h6.c.v]\no0.v = 5',
          `  beforeLoad: () => o0,\n  component: ${component},`,
        ),
      )
      expect(r.text).toBe('1')
    },
    timeout,
  )

  test(
    'a read of an object a function writes through a holder keeps the value the source reads',
    async () => {
      const r = await mounted(
        bundler,
        route(
          'const cfg = { v: 1 }\nconst holder = [cfg]\nfunction bump() { holder[0].v = 4 }\nconst y = cfg.v',
          '  beforeLoad: () => bump(),\n  component: () => <p>{y}</p>,',
        ),
        true,
      )
      expect(r.text).toBe('1')
    },
    timeout,
  )

  test.each([
    [
      'an object literal',
      "const log = { push(x: string) { track(x) } }\nlog.push('first')",
    ],
    [
      'a class',
      "class Reg { static add(x: string) { track(x) } }\nReg.add('first')",
    ],
    [
      'a function given the method',
      "function Page() { return null }\nPage.set = (x: string) => track(x)\nPage.set('first')",
    ],
  ])(
    // (no order rule: the binding and its augmentation move with the
    // component, in their order; the bare call after them runs first)
    'a mutator-named method of %s moves with its binding past an effect after it',
    async (_, decls) => {
      const r = await mounted(
        bundler,
        route(
          `${decls}\ntrack('second')`,
          `  component: () => <p>{String(${/(?:const|class|function) (\w+)/.exec(decls)![1]} !== undefined)}</p>,`,
        ),
      )
      expect(r.text).toBe('true')
      expect(r.atLoad).toEqual(['second'])
    },
    timeout,
  )
})
