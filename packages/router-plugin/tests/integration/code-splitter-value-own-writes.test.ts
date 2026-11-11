/**
 * A component option whose call runs a function writing module state
 * (`memo(function Page() { didInit = true })`): the write may run at any
 * time, but when nothing else of the module touches that state, it and the
 * state load with the component's chunk, so the option is split, with no
 * warning (REVIEW design 2 step 4, finding 3; the same write at load is
 * split already). Another reader keeps the option in place, wherever it
 * evaluates: one in a module two chunks share too, which would otherwise
 * import the state from the component's chunk while that chunk imports it
 * (REVIEW design 2 final, finding 2). Real builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

async function buildRoute(
  bundler: 'vite' | 'rspack',
  route: string,
  /** Split groupings (`codeSplittingOptions.defaultBehavior`). */
  groupings?: Array<Array<'loader' | 'component'>>,
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    ...(groupings && {
      pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
    }),
    files: routeApp(route, {
      env: 'client',
      files: {
        'entry.ts': clientMountEntry,
        'registry.ts': 'export const registry = { count: 0 }\n',
      },
    }),
  })
  const warnings = findDiagnostics(app.warnings, {
    severity: 'warning',
  })
    .filter(({ text }) => text.includes('routes/index.tsx'))
    .map(({ text }) => text)
  try {
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)',
    )
    return {
      where: app.where('MARK_PAGE'),
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      warnings,
    }
  } finally {
    await app.dispose()
  }
}

const route = (decls: string, options: string) =>
  `${head}import { memo } from 'react'
import { registry } from '../registry'
${decls}
export const Route = createFileRoute('/')({
${options}
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    [
      'assigns a `let`',
      'let didInit = false',
      '  component: memo(function Page() { if (!didInit) { didInit = true } return <p>MARK_PAGE{String(didInit)}</p> }),',
      'MARK_PAGEtrue',
    ],
    [
      'writes a member of a `const`',
      'const seen = { n: 0 }',
      '  component: memo(function Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> }),',
      'MARK_PAGE1',
    ],
    [
      'writes a member of an import in an event handler',
      '',
      '  component: memo(function Page() { return <button onClick={() => { registry.count++ }}>MARK_PAGE</button> }),',
      'MARK_PAGE',
    ],
    [
      'is declared in a `const`, writing a member of a `const`',
      'const seen = { n: 0 }\nconst C = memo(function Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> })',
      '  component: C,',
      'MARK_PAGE1',
    ],
    [
      'is named, writing a member of a `const`',
      'const seen = { n: 0 }\nfunction Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> }',
      '  component: memo(Page),',
      'MARK_PAGE1',
    ],
  ])(
    'splits a component whose call runs a function that %s nothing else touches',
    async (_, decls, options, text) => {
      const r = await buildRoute(bundler, route(decls, options))
      expect(r.where).toBe('lazy')
      expect(r.text).toBe(text)
      expect(r.warnings).toEqual([])
    },
    timeout,
  )

  test(
    'keeps a value assigning a `let` that a module two chunks share reads in place',
    async () => {
      const r = await buildRoute(
        bundler,
        `${head}let n = 1
export const Route = createFileRoute('/')({
  loader: () => flags,
  component: (n = 5, () => <p>MARK_PAGE{String(flags)}</p>),
})
const flags = [n]
`,
        [['loader'], ['component']],
      )
      expect(r.where).toBe('eager')
      expect(r.text).toBe('MARK_PAGE5')
    },
    timeout,
  )

  // REVIEW design 2 final, finding 4 (g): the binding stays only for its
  // initialiser's effects; the offered annotation frees the option
  test(
    'names the effectful initialiser of a `let` the option assigns, and the annotation frees it',
    async () => {
      const options = '  component: (n = 5, () => <p>MARK_PAGE{n}</p>),'
      const kept = await buildRoute(
        bundler,
        route('const box = (x: number) => [x][0]!\nlet n = box(0)', options),
      )
      expect(kept.where).toBe('eager')
      expect(kept.warnings).toHaveLength(1)
      expect(kept.warnings[0]).toContain(
        'it writes `n`, which stays in the route module because its initialiser has side effects, so a split would run the write later than written. Mark that initialiser `/* @__PURE__ */` if it has none.',
      )
      const freed = await buildRoute(
        bundler,
        route(
          'const box = (x: number) => [x][0]!\nlet n = /* @__PURE__ */ box(0)',
          options,
        ),
      )
      expect(freed.where).toBe('lazy')
      expect(freed.text).toBe('MARK_PAGE5')
      expect(freed.warnings).toEqual([])
    },
    timeout,
  )

  test(
    'splits it when the state the route module reads is a member of an object (the fix offered below)',
    async () => {
      const r = await buildRoute(
        bundler,
        route(
          'const state = { didInit: false }',
          '  beforeLoad: () => state.didInit,\n  component: memo(function Page() { if (!state.didInit) { state.didInit = true } return <p>MARK_PAGE{String(state.didInit)}</p> }),',
        ),
      )
      expect(r.where).toBe('lazy')
      expect(r.text).toBe('MARK_PAGEtrue')
      expect(r.warnings).toEqual([])
    },
    timeout,
  )

  test(
    'keeps it in place when other code reads the state (control)',
    async () => {
      const r = await buildRoute(
        bundler,
        route(
          'let didInit = false',
          '  beforeLoad: () => didInit,\n  component: memo(function Page() { if (!didInit) { didInit = true } return <p>MARK_PAGE{String(didInit)}</p> }),',
        ),
      )
      expect(r.where).toBe('eager')
      expect(r.text).toBe('MARK_PAGEtrue')
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain(
        'The `component` option of routes/index.tsx is not code-split: it writes `didInit`, which the route module also uses, and a split chunk cannot write a binding of another module. Keep that state in an object (`state.didInit`) or in its own module.',
      )
    },
    timeout,
  )
})
