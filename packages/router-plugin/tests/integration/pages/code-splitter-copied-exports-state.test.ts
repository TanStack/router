/**
 * Dev twin of ../code-splitter-copied-exports-state.test.ts (SPEC J2.4,
 * G13 dev/build parity): the same route files on a real dev server, in a
 * real browser page (`../../route-app`). In dev an extracted export stays
 * in the route module and the chunk copies or imports it exactly as in a
 * build, so state and identity agree between the two modes; a build is
 * where an extracted module and a chunk would each get their own copy of
 * what a copied export reads, which is why the build file exists.
 * Source: external review 2 of the compiler rewrite, finding 4.
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, head, loadRoute } from '../../route-app'

const fire = `() => {
    ;(globalThis.__fired = (globalThis.__fired ?? 0) + 1)
  }`

const listeners = `${head}const listeners: Array<() => void> = []
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

const thrownClass = `${head}export class NotAllowed extends Error {}
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

const importer = { 'importer.ts': `export * from './route'\n` }

const catchComponent = `let caught
try {
  await render('component')
} catch (error) {
  caught = error
}`

type Case = {
  name: string
  route: string
  files?: Record<string, string>
  script: string
  expected: unknown
}

const moduleState: Array<Case> = [
  {
    name: 'is shared by two split options',
    route: listeners,
    script: `const a = await render('component')
const b = await render('errorComponent', { error: new Error('x') })
return [a, b, globalThis.__fired ?? 0]`,
    expected: ['<p>subscribed</p>', '<p>emitted</p>', 1],
  },
  {
    name: 'is shared by an importer of the route file and a split option',
    route: listeners,
    files: importer,
    script: `const imported = await app('importer.ts')
imported.subscribe(${fire})
const b = await render('errorComponent', { error: new Error('x') })
return [b, globalThis.__fired ?? 0]`,
    expected: ['<p>emitted</p>', 1],
  },
  {
    name: 'is shared by two importer-side calls through the route file',
    route: listeners,
    files: importer,
    script: `const imported = await app('importer.ts')
imported.subscribe(${fire})
imported.emit()
return globalThis.__fired ?? 0`,
    expected: 1,
  },
]

const identity: Array<Case> = [
  {
    name: 'a thrown exported class is recognised by instanceof in the errorComponent chunk',
    route: thrownClass,
    script: `${catchComponent}
return await render('errorComponent', { error: caught })`,
    expected: '<p>true</p>',
  },
  {
    name: 'a thrown exported class is recognised by instanceof in an importer of the route file',
    route: thrownClass,
    files: importer,
    script: `const imported = await app('importer.ts')
${catchComponent}
return caught instanceof imported.NotAllowed`,
    expected: true,
  },
  {
    name: 'a @__PURE__ context the route component provides reaches a consumer importing it from the route file',
    route: `${head}import { createContext } from 'react'
import { Child } from './child'
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
import { Ctx } from './route'
export function Child() {
  return <b>{useContext(Ctx)}</b>
}
`,
    },
    script: `return await render('component')`,
    expected: '<b>provided</b>',
  },
  {
    name: 'an exported sentinel an exported function returns compares equal through the route file',
    route: `${head}export const EMPTY: ReadonlyArray<string> = []
export function pick(list: ReadonlyArray<string>) {
  return list.length === 0 ? EMPTY : list
}
function Page() {
  return <p>{String(pick([]) === EMPTY)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    files: importer,
    script: `const imported = await app('importer.ts')
const html = await render('component')
return [html, imported.pick([]) === imported.EMPTY]`,
    expected: ['<p>true</p>', true],
  },
]

identity.push(
  {
    name: 'an exported constructor function is recognised by instanceof in an importer of the route file',
    route: `${head}export function Point(this: any, x: number) {
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
    files: importer,
    script: `const imported = await app('importer.ts')
const html = await render('component')
return [html, imported.isPoint(new imported.Point(1))]`,
    expected: ['<p>true</p>', true],
  },
  {
    name: 'an exported function sentinel compares equal through two exports of the route file',
    route: `${head}export const DEFAULT = () => {}
export function isDefault(cb: unknown) {
  return cb === DEFAULT
}
function Page() {
  return <p>{String(isDefault(DEFAULT))}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    files: importer,
    script: `const imported = await app('importer.ts')
const html = await render('component')
return [html, imported.isDefault(imported.DEFAULT)]`,
    expected: ['<p>true</p>', true],
  },
  {
    name: "a copied exported function held by an exported object is the importer's instance",
    route: `${head}export function helper() {
  return 1
}
export const config = { helper }
function Page() {
  return <p>{config.helper() + helper()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    files: importer,
    script: `const imported = await app('importer.ts')
const html = await render('component')
return [html, imported.config.helper === imported.helper]`,
    expected: ['<p>2</p>', true],
  },
)

const mutated = (
  name: string,
  decl: string,
  mutation: string,
  read: string,
): Case => ({
  name: `the importer reads what the split component wrote through ${name}`,
  route: `${head}${decl}
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
  files: importer,
  script: `const imported = await app('importer.ts')
const html = await render('component')
return [html, imported.read()]`,
  expected: ['<p>1</p>', 1],
})

const mutations: Array<Case> = [
  mutated(
    'a method writing this',
    `export const counter = { n: 0, inc() { this.n++ } }`,
    `counter.inc()`,
    `counter.n`,
  ),
]

const suite = (title: string, cases: Array<Case>) =>
  describe(title, () => {
    for (const c of cases) {
      it(c.name, async () => {
        const route = await loadRoute(c.route, { files: c.files })
        await expectValidModules(route)
        expect(await route.run(c.script)).toEqual(c.expected)
      })
    }
  })

suite(
  'in dev, private module state behind exported functions the chunk imports',
  moduleState,
)
suite('in dev, identity of exported bindings the chunk imports', identity)
suite(
  'in dev, forms of mutation of module state the split component reaches',
  mutations,
)
