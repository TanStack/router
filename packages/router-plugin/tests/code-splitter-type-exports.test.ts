/**
 * Type-only exports of a route file (`export type { X }`, `export { type X }`,
 * `export type { X } from '…'`) have no runtime meaning: the code splitter
 * removes them from what it emits, as `main` does (`stripTypeExports`). A
 * Babel plugin that runs after the router plugin (React Compiler through
 * `@rolldown/plugin-babel`, which parses TypeScript and JSX) then parses
 * every module the route serves; an export of a type import the splitter
 * removed would be one Babel's parser rejects ("Export 'X' is not
 * defined"), failing the app where `main` serves it. Found by the corpus
 * identity runs of #8817 (brain-dump `claude-tasks.ts`: `import { table,
 * type Row }` with `export type { Row }`). The route runs in a real browser
 * page (`./route-app`); the Start twin (server fns, client and server):
 * start-plugin-core tests/start-compiler-type-exports.test.ts.
 */
import { expect, test } from 'vitest'
import babel from '@rolldown/plugin-babel'
// @ts-expect-error -- the preset ships no type declarations
import typescript from '@babel/preset-typescript'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { head, loadRoute } from './route-app'

/** The module the route files import: a value, a type, a label. */
const thing = `export const fetchThing = () => 'MARK_THING_DATA'
export type Thing = string
export type Shape = { s: string }
export const label = 'MARK_LABEL'
`

/** A route whose loader reads `fetchThing` and whose component splits. */
const route = (imports: string, exports: string) => `${head}${imports}
${exports}
export const Route = createFileRoute('/')({
  loader: (): Thing => fetchThing(),
  component: () => <p>MARK_PAGE</p>,
})
`

test.each([
  {
    name: '`export type { X }` of an inline type import',
    code: route(
      `import { fetchThing, type Thing } from './thing'`,
      'export type { Thing }',
    ),
    label: null,
  },
  {
    name: '`export { type X, y }` of an inline type import (y stays)',
    code: route(
      `import { fetchThing, label, type Thing } from './thing'`,
      'export { type Thing, label }',
    ),
    label: 'MARK_LABEL',
  },
  // Source: the Astra core review 5.
  {
    name: '`export { type X, y }` with a `}` in a comment before its `;` (y stays)',
    code: route(
      `import { fetchThing, label, type Thing } from './thing'`,
      'export { type Thing, label } /* } */ ;',
    ),
    label: 'MARK_LABEL',
  },
  {
    name: '`export type { X } from` and `export { y, type X } from` (y stays)',
    code: route(
      `import { fetchThing } from './thing'
import type { Thing } from './thing'`,
      `export type { Shape } from './thing'
export { label, type Thing as Alias } from './thing'`,
    ),
    label: 'MARK_LABEL',
  },
])(
  'a route with $name serves through a Babel plugin after the router plugin',
  async ({ code, label }) => {
    const app = await loadRoute(code, {
      files: { 'thing.ts': thing },
      plugins: {
        after: [
          babel({
            presets: [[typescript, { allExtensions: true, isTSX: true }]],
          }),
        ],
      },
    })
    expect(await app.isLazy('component')).toBe(true)
    const [html, data, exported] = await app.run<[string, unknown, unknown]>(
      `return [await renderRoute(), await options.loader(), exports.label ?? null]`,
    )
    expect(html).toContain('MARK_PAGE')
    expect(data).toBe('MARK_THING_DATA')
    expect(exported).toBe(label)
    expectNoProblems(await app.diagnostics())
  },
)

/** `track(name)` records each call and returns a fresh object (`seen()`). */
const trackFile = `const calls: Array<string> = []
export function track(name: string) {
  calls.push(name)
  return { name }
}
export const seen = () => calls
`

// An overload signature is TypeScript's text: what only it names in a type
// leaves the route module, parameters or not, in a route nothing is split
// from (Astra's re-check of the declarations lane: these regressed when the
// compile looked for erased text only where other text was removed).
test.each([
  {
    name: 'a parameterless overload exported by a specifier',
    code: `function read(): typeof sv
function read() { return 1 }
export { read }`,
    seen: [],
  },
  {
    name: 'an anonymous parameterless default overload',
    code: `export default function (): typeof sv
export default function () { return 1 }`,
    seen: [],
  },
  {
    // the control: the implementation reads the value
    name: 'a parameterless overload whose implementation reads the value',
    code: `function read(): typeof sv
function read() { return sv.name }
export { read }`,
    seen: ['sv'],
  },
])('$name', async ({ code, seen }) => {
  const loaded = await loadRoute(
    `${head}import { track } from './track'
const sv = track('sv')
${code}
export const Route = createFileRoute('/')({})
`,
    { files: { 'track.ts': trackFile } },
  )
  expect(
    await loaded.run(`const { seen } = await app('track.ts')
return seen()`),
  ).toEqual(seen)
})

// A dotted namespace with values is a value: a split component reading
// it gets it (Fable's re-check of 7278f28ef1: the chunk read `N` without
// declaring it).
test('a split component reads a member of a dotted namespace', async () => {
  const loaded = await loadRoute(
    `${head}namespace N.M { export const a = 'MARK_DOTTED' }
export const Route = createFileRoute('/')({ component: () => <p>{N.M.a}</p> })
`,
  )
  expect(await loaded.renderLazy('component')).toEqual({
    lazy: true,
    html: '<p>MARK_DOTTED</p>',
  })
})
