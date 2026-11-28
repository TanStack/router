/**
 * Isomorphic and env-only fns called where they are written, as a statement
 * of the module (`createIsomorphicFn().server(() => { use(label) })()`), in
 * real builds whose output runs: the side the implementation is for runs it
 * with everything it reads, at module load, and the other side's build holds
 * none of it. SPEC J4.9, G8.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'

const seen = `export const seen: Array<string> = []
export const note = (value: string) => {
  seen.push(value)
}
`
/** A module's start: the reads of its implementations are pure bindings of the module, and an import. */
const reads = (
  marker: string,
  factory = 'createIsomorphicFn',
) => `import { ${factory} } from '@tanstack/react-start'
import { note } from './seen'
const label = '${marker}'
function use(value: string) {
  note(value)
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  test('an isomorphic fn called as a statement runs its implementation with what it reads', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/seen.ts': seen,
        'src/iso-server.ts': `${reads('MARK_SERVER')}createIsomorphicFn().server(() => { use(label) })()\n`,
        'src/iso-client.ts': `${reads('MARK_CLIENT')}createIsomorphicFn().client(() => { use(label) })()\n`,
        'src/iso-both.ts': `${reads('MARK_BOTH_SERVER')}const other = 'MARK_BOTH_CLIENT'
createIsomorphicFn().server(() => { use(label) }).client(() => { use(other) })();
`,
        'src/iso-named.ts': `${reads('MARK_NAMED')}function impl() { use(label) }
createIsomorphicFn().server(impl)()
`,
        'entry.ts': `import './src/iso-server'
import './src/iso-client'
import './src/iso-both'
import './src/iso-named'
export { seen } from './src/seen'
`,
      },
    })
    expect((await ssr.run(`return entry.seen`)).result).toEqual([
      'MARK_SERVER',
      'MARK_BOTH_SERVER',
      'MARK_NAMED',
    ])
    expect((await client.run(`return entry.seen`)).result).toEqual([
      'MARK_CLIENT',
      'MARK_BOTH_CLIENT',
    ])
    for (const marker of ['MARK_SERVER', 'MARK_BOTH_SERVER', 'MARK_NAMED']) {
      expect(client.where(marker), marker).toBe('nowhere')
    }
    for (const marker of ['MARK_CLIENT', 'MARK_BOTH_CLIENT']) {
      expect(ssr.where(marker), marker).toBe('nowhere')
    }
  })

  test('a server-only fn called as a statement runs on the server with what it reads, and only its stub reaches the client', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/seen.ts': seen,
        'entry.ts':
          `${reads('MARK_ONLY', 'createServerOnlyFn')}createServerOnlyFn(() => { use(label) })()
export { seen } from './seen'
`.replaceAll('./seen', './src/seen'),
      },
    })
    expect((await ssr.run(`return entry.seen`)).result).toEqual(['MARK_ONLY'])
    expect(client.where('MARK_ONLY')).toBe('nowhere')
  })

  test('an implementation in a type wrapper, called in place, runs in its environment', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/seen.ts': seen,
        'src/iso-server.ts': `${reads('MARK_ISO_SERVER')}function impl() { use(label) }
createIsomorphicFn().server(impl as any)()
`,
        'src/iso-client.ts': `${reads('MARK_ISO_CLIENT')}function impl() { use(label) }
createIsomorphicFn().client(impl satisfies () => void)()
`,
        'src/iso-both.ts': `${reads('MARK_ISO_BOTH_SERVER')}const other = 'MARK_ISO_BOTH_CLIENT'
function impl() { use(label) }
function clientImpl() { use(other) }
const value = createIsomorphicFn().server(impl as any).client(clientImpl as any)()
export { value }
`,
        'src/server-only.ts': `${reads('MARK_SERVER_ONLY', 'createServerOnlyFn')}function impl() { use(label) }
// (the client's stub throws)
if (typeof window === 'undefined') createServerOnlyFn(impl as any)()
`,
        'src/client-only.ts': `${reads('MARK_CLIENT_ONLY', 'createClientOnlyFn')}function impl() { use(label) }
// (the server's stub throws)
if (typeof window !== 'undefined') createClientOnlyFn(impl as any)()
`,
        'src/statement.ts': `${reads('MARK_STATEMENT', 'createServerOnlyFn')}createServerOnlyFn(function () { use(label) } as any)
`,
        'entry.ts': `import './src/iso-server'
import './src/iso-client'
import './src/iso-both'
import './src/server-only'
import './src/client-only'
import './src/statement'
export { seen } from './src/seen'
`,
      },
    })
    expect((await ssr.run(`return entry.seen`)).result).toEqual([
      'MARK_ISO_SERVER',
      'MARK_ISO_BOTH_SERVER',
      'MARK_SERVER_ONLY',
    ])
    expect((await client.run(`return entry.seen`)).result).toEqual([
      'MARK_ISO_CLIENT',
      'MARK_ISO_BOTH_CLIENT',
      'MARK_CLIENT_ONLY',
    ])
    for (const marker of [
      'MARK_ISO_SERVER',
      'MARK_ISO_BOTH_SERVER',
      'MARK_SERVER_ONLY',
      'MARK_STATEMENT',
    ]) {
      expect(client.where(marker), marker).toBe('nowhere')
    }
  })

  // the server keeps the implementation as the statement: an async
  // function expression, with a comment or a long run of spaces between
  // `async` and `function`, written as a statement in parentheses (it is no
  // declaration); the control without trivia. Source: Astra review 3
  // (core B4)
  test('a server-only fn written as a statement, its implementation an async function expression with trivia after `async`: both builds run', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/seen.ts': seen,
        'src/comment.ts': `${reads('MARK_ASYNC_COMMENT', 'createServerOnlyFn')}createServerOnlyFn(async /* posted */ function () { use(label) })
export const comment = 'comment'
`,
        'src/spaces.ts': `${reads('MARK_ASYNC_SPACES', 'createServerOnlyFn')}createServerOnlyFn(async                function () { use(label) })
export const spaces = 'spaces'
`,
        'src/plain.ts': `${reads('MARK_ASYNC_PLAIN', 'createServerOnlyFn')}createServerOnlyFn(async function () { use(label) })
export const plain = 'plain'
`,
        'entry.ts': `export { comment } from './src/comment'
export { spaces } from './src/spaces'
export { plain } from './src/plain'
export { seen } from './src/seen'
`,
      },
    })
    const run = `return [entry.comment, entry.spaces, entry.plain, entry.seen]`
    const expected = ['comment', 'spaces', 'plain', []]
    expect((await ssr.run(run)).result).toEqual(expected)
    expect((await client.run(run)).result).toEqual(expected)
    for (const marker of [
      'MARK_ASYNC_COMMENT',
      'MARK_ASYNC_SPACES',
      'MARK_ASYNC_PLAIN',
    ]) {
      expect(client.where(marker), marker).toBe('nowhere')
    }
  })

  // a kept implementation at the left edge of an `export default`: a named
  // function expression stays an expression, so its name binds nothing in
  // the module, which reads the global `fetch`. Source: Astra review 4
  // (architecture B1)
  test('a default-exported env fn whose implementation is a named function expression: the module reads the global of that name', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/only.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export default createServerOnlyFn(function fetch() { return 'only' })
export const value = fetch === globalThis.fetch ? 'native' : 'shadowed'
`,
        'src/iso.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export default createIsomorphicFn()
  .server(function fetch() { return 'iso-server' })
  .client(function fetch() { return 'iso-client' })
export const value = fetch === globalThis.fetch ? 'native' : 'shadowed'
`,
        'entry.ts': `export * as only from './src/only'
export * as iso from './src/iso'
`,
      },
    })
    expect(
      (
        await ssr.run(`return [
  entry.only.default(), entry.only.value,
  entry.iso.default(), entry.iso.value,
]`)
      ).result,
    ).toEqual(['only', 'native', 'iso-server', 'native'])
    expect(
      (
        await client.run(
          `return [entry.only.value, entry.iso.default(), entry.iso.value]`,
        )
      ).result,
    ).toEqual(['native', 'iso-client', 'native'])
  })

  // the same, its name also a binding of the module, or its text in a type
  // wrapper (`function f() {} as any`, a class expression): no declaration,
  // so no redeclaration and no statement ending before `as`. Source: Astra
  // review 4 (architecture B1)
  test('a default-exported server-only fn whose implementation is named like a binding of the module, or wrapped: the build runs it and the module reads its own binding', async () => {
    const { ssr } = await buildStart({
      bundler,
      files: {
        'src/local.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const run = 'MARK_LOCAL_RUN'
export default createServerOnlyFn(function run() { return 'local' })
export const value = run
`,
        'src/as.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export default createServerOnlyFn(function fetch() { return 'as' } as any)
export const value = fetch === globalThis.fetch ? 'native' : 'shadowed'
`,
        'src/class.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export default createServerOnlyFn(class fetch { static kind = 'class' } as any)
export const value = fetch === globalThis.fetch ? 'native' : 'shadowed'
`,
        'entry.ts': `export * as local from './src/local'
export * as wrapped from './src/as'
export * as cls from './src/class'
`,
      },
    })
    expect(
      (
        await ssr.run(`return [
  entry.local.default(), entry.local.value,
  entry.wrapped.default(), entry.wrapped.value,
  entry.cls.default.kind, entry.cls.value,
]`)
      ).result,
    ).toEqual(['local', 'MARK_LOCAL_RUN', 'as', 'native', 'class', 'native'])
  })

  // a kept implementation at the left edge of a statement, an arrow's
  // expression body or an `export default` with a call or member after it:
  // the statement starts with the implementation's text (`function () {}`,
  // `{ f }`), which stays an expression. Source: Astra review 4 (core B4)
  test('a server-only fn whose implementation starts its statement and is called or read in place: the server runs it', async () => {
    const { ssr } = await buildStart({
      bundler,
      files: {
        'src/shapes.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export function bound() {
  let a = 0
  createServerOnlyFn(function () { a++ }.bind(null))()
  return a
}
export function object() {
  let a = 0
  createServerOnlyFn({ f: () => ++a }.f.bind(null))()
  return a
}
export function member() {
  let a = 0
  createServerOnlyFn(function () { a++ }.bind(null)).call(null)
  return a
}
export const arrow = () => createServerOnlyFn({ f: () => 'arrow' }.f.bind(null))()
`,
        'src/default.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export default createServerOnlyFn(function () { return 'default' }.bind(null))()
`,
        'entry.ts': `export * as shapes from './src/shapes'
export { default } from './src/default'
`,
      },
    })
    expect(
      (
        await ssr.run(`return [
  entry.shapes.bound(),
  entry.shapes.object(),
  entry.shapes.member(),
  entry.shapes.arrow(),
  entry.default,
]`)
      ).result,
    ).toEqual([1, 1, 1, 'arrow', 'default'])
  })

  // a kept `new Factory` (`new Factory<T>`), written without an argument
  // list, called or read in place: the call and the read apply to the
  // constructed value, not to the constructor. Source: Astra review 4 (core
  // B5), the generic spelling Astra review 5 (core B3)
  test('a server-only fn whose implementation is a `new` without arguments, called or read in place: the server calls or reads the constructed value', async () => {
    const { ssr } = await buildStart({
      bundler,
      files: {
        'entry.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const Factory = class {
  constructor() {
    return Object.assign(() => 7, { label: 'constructed' })
  }
} as unknown as new () => (() => number) & { label: string }
export const called = () => createServerOnlyFn(new Factory)()
export const read = () => createServerOnlyFn(new Factory).label
const Generic = Factory as unknown as new <T>() => (() => number) & { label: string }
export const calledGeneric = () => createServerOnlyFn(new Generic<string>)()
export const readGeneric = () => createServerOnlyFn(new Generic<string>).label
`,
      },
    })
    expect(
      (
        await ssr.run(
          `return [entry.read(), entry.called(), entry.readGeneric(), entry.calledGeneric()]`,
        )
      ).result,
    ).toEqual(['constructed', 7, 'constructed', 7])
  })

  test('a route file with one: the page renders, and its server code stays out of the client', async () => {
    const build = await buildStart({
      bundler,
      files: {
        ...startPageEntries,
        ...pageEntries,
        'src/router.ts': routerFile,
        'src/routes/__root.tsx': rootDocument(),
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
const label = 'MARK_ROUTE_LABEL'
createIsomorphicFn().server(() => { (globalThis as Record<string, unknown>).routeLabel = label })()
export const Route = createFileRoute('/')({ component: () => <p data-testid="shown">shown</p> })
`,
      },
    })
    const served = await serveStartBuild(build)
    const page = await openAppPage(served, '/')
    await page.waitForText('shown', { selector: '[data-testid=shown]' })
    expect(page.errors).toEqual([])
    expect(build.client.where('MARK_ROUTE_LABEL')).toBe('nowhere')
    expect(build.ssr.where('MARK_ROUTE_LABEL')).not.toBe('nowhere')
  })
})
