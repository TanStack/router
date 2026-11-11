/**
 * A read of an enum member runs no code: the enum's object holds plain data.
 * Real builds, both directions, with a `const` object's member read (which may
 * be a getter) as the control.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 60_000

const entry = `${clientMountEntry}
export const effects = () => (globalThis as any).__effects
`

async function buildRoute(route: string, files: Record<string, string> = {}) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files: routeApp(route, {
      env: 'client',
      files: { 'entry.ts': entry, ...files },
    }),
  })
  const warnings = findDiagnostics(app.warnings, {
    severity: 'warning',
  }).filter(({ text }) => text.includes('routes/index.tsx'))
  return { app, warnings: warnings.map(({ text }) => text) }
}

/** Builds the route and renders its component after loading its chunk. */
async function render(route: string, files: Record<string, string> = {}) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files: routeApp(route, {
      env: 'client',
      files: {
        'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
        ...files,
      },
    }),
  })
  const { result } = await app.run(
    'return entry.render(entry.Route.options.component)',
  )
  return result
}

const component = (read: string) =>
  `export const Route = createFileRoute('/')({ component: () => <p>{${read}}</p> })\n`

const effect = `const effects: Array<string> = ((globalThis as any).__effects = [])
function fx(name: string) {
  effects.push(name)
  return 1
}
`

describe('an enum initialised from a read of an enum member', () => {
  test.each([
    [
      'an exported enum reading another enum',
      `enum A { Y = 'MARK_READ' }\nexport enum B { X = A.Y }\n`,
      'B.X',
    ],
    [
      'an exported enum reading its own member',
      `export enum B { X = 1, Z = B.X + 1, M = 'MARK_READ' }\n`,
      'B.Z',
    ],
    [
      'an unexported enum reading another',
      `enum A { Y = 'MARK_READ' }\nenum B { X = A.Y }\n`,
      'B.X',
    ],
    [
      'a computed key that is a string',
      `enum A { Y = 'MARK_READ' }\nexport enum B { X = A['Y'] }\n`,
      'B.X',
    ],
    [
      'a const enum',
      `const enum A { Y = 'MARK_READ' }\nexport enum B { X = A.Y }\n`,
      'B.X',
    ],
    [
      'a const the module already treats as a pure read',
      `const LIMIT = 'MARK_READ'\nexport enum B { X = LIMIT }\n`,
      'B.X',
    ],
    [
      'a const read of an enum member',
      `enum A { Y = 'MARK_READ' }\nconst y = A.Y\n`,
      'y',
    ],
  ])(
    '%s moves with its only reader, with no warning',
    async (_, source, read) => {
      const { app, warnings } = await buildRoute(
        `${head}${source}${component(read)}`,
      )
      expect(app.where('MARK_READ')).toBe('lazy')
      expect(warnings).toEqual([])
    },
    timeout,
  )

  test(
    'a member a call computes keeps its evaluation order',
    async () => {
      const { app } = await buildRoute(`${head}${effect}fx('before')
enum E { A = fx('enum') }
fx('after')
${component('E.A')}`)
      const { result } = await app.run('return entry.effects()')
      expect(result).toEqual(['before', 'enum', 'after'])
    },
    timeout,
  )

  test(
    'a member a call computes keeps its order when another enum reads it',
    async () => {
      const { app } = await buildRoute(`${head}${effect}fx('before')
enum A { Y = fx('enum') }
enum B { X = A.Y }
fx('after')
${component('B.X')}`)
      const { result } = await app.run('return entry.effects()')
      expect(result).toEqual(['before', 'enum', 'after'])
    },
    timeout,
  )

  // (rendered: a statement probing `B.X` into a global would follow `B`,
  // the only binding it touches, into the chunk)
  test(
    'a member written after the read keeps the value the source reads',
    async () => {
      const result = await render(`${head}enum A { Y = 1 }
enum B { X = A.Y }
;(A as any).Y = 2
${component('B.X')}`)
      expect(result).toBe('<p>1</p>')
    },
    timeout,
  )
})

// Rule L: a member read is a language operation, no effect, whatever the
// object (a getter stays outside the model, as for reads, R97): these
// moved with the chunk; they stayed effects, with a warning, before
describe('member reads that are language operations (rule L)', () => {
  test(
    "a const object's member, a getter, loads with the chunk, unreported",
    async () => {
      const { app, warnings } = await buildRoute(
        `${head}const O = { get y() { return 'MARK_READ' } }
export enum B { X = O.y as any }
${component('B.X')}`,
      )
      expect(app.where('MARK_READ')).toBe('lazy')
      expect(warnings).toEqual([])
    },
    timeout,
  )

  test(
    "an imported enum's member read is no effect",
    async () => {
      const { warnings } = await buildRoute(
        `${head}import { A } from '../a'
export enum B { X = A.Y }
${component('B.X')}`,
        { 'a.ts': `export enum A { Y = 'MARK_A' }\n` },
      )
      expect(warnings.some((text) => text.includes('side effects'))).toBe(false)
    },
    timeout,
  )

  test(
    "a declared enum's member read is no effect",
    async () => {
      const { warnings } = await buildRoute(
        `${head};(globalThis as any).A = { Y: 'y' }
declare enum A { Y = 'y' }
export enum B { X = A.Y as any }
${component('B.X')}`,
      )
      expect(warnings.some((text) => text.includes('side effects'))).toBe(false)
    },
    timeout,
  )
})

// What can write the enum without the mutation model seeing it: the read keeps
// the value the source gives it, so it stays before the write.
describe('an enum something can write out of sight', () => {
  test.each([
    ['an alias', `const alias: any = E\nconst y = E.A\nalias.A = 'NEW'\n`],
    [
      'an argument',
      `function w(o: any) { o.A = 'NEW' }\nconst y = E.A\nw(E)\n`,
    ],
    ['a built-in', `const y = E.A\nReflect.set(E, 'A', 'NEW')\n`],
    [
      'a method of its object',
      `const y = E.A\n;(E as any).__defineGetter__('A', () => 'NEW')\n`,
    ],
    [
      'a method of its object, without a cast',
      `const y = E.A\n// @ts-ignore\nE.__defineGetter__('A', () => 'NEW')\n`,
    ],
    [
      'a parenthesised method of its object',
      `const y = E.A\n// @ts-ignore\n;(E.__defineGetter__)('A', () => 'NEW')\n`,
    ],
    ['an import alias', `import F = E\nconst y = E.A\n;(F as any).A = 'NEW'\n`],
    [
      'a holder',
      `const holder = { e: E as any }\nconst y = E.A\nholder.e.A = 'NEW'\n`,
    ],
    [
      'a function of a merged namespace',
      `namespace E { export function w(this: any) { this.A = 'NEW' } }\nconst y = E.A\nE.w()\n`,
    ],
  ])(
    '%s: a read before the write keeps the first value',
    async (_, source) => {
      const result = await render(
        `${head}enum E { A = 'MARK_OLD' }
${source}${component('y')}`,
      )
      expect(result).toBe('<p>MARK_OLD</p>')
    },
    timeout,
  )

  // reported (no order rule, rule L): the member read is no effect and
  // moves with the chunk; the call of an imported function stays (it
  // touches an import) and writes nothing it is handed, for the compiler
  test(
    'an imported function: a read before the write reads the written value',
    async () => {
      const result = await render(
        `${head}enum E { A = 'MARK_OLD' }
import { write } from '../write'
const y = E.A
write(E)
${component('y')}`,
        { 'write.ts': `export const write = (o: any) => { o.A = 'NEW' }\n` },
      )
      expect(result).toBe('<p>NEW</p>')
    },
    timeout,
  )

  test(
    'a merged namespace member a function of it changes keeps the first value',
    async () => {
      const app = await build({
        // (Oxc doesn't take a namespace's `export let`)
        bundler: 'rspack',
        env: 'client',
        minify: false,
        files: routeApp(
          `${head}enum E { A = 1 }
namespace E { export let v = 'MARK_OLD'; export function set() { v = 'NEW' } }
const y = E.v
E.set()
${component('y')}`,
          {
            env: 'client',
            files: {
              'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
            },
          },
        ),
      })
      const { result } = await app.run(
        'return entry.render(entry.Route.options.component)',
      )
      expect(result).toBe('<p>MARK_OLD</p>')
    },
    timeout,
  )
})
