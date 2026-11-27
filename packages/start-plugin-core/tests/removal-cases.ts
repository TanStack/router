import { expect } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import type { PageSettled, StartHost } from './regression-helpers'

// The dead-code removal rule's rows (SPEC G16, R153 amendment, R170): a
// definition the source used from removed code (a server fn handler, a
// `createServerOnlyFn` body, a type the client's TypeScript erases) leaves
// the client when nothing that stays reads it by value, and nothing else
// changes. Each row is a module of the case with `run()`: the client page's
// `run()` must give what the source gives (its value or the name of what it
// throws, and what it records), so a removed registration or a
// `ReferenceError` the removal causes fails the row; `gone` rows also say
// that the client does not load the server module. Sources: the merged DCE
// design and its reviews (design-dce-merged-v3.md, design-dce-v4-table.md),
// each row naming its case.

/** The `createServerOnlyFn` and `createServerFn` imports of a row. */
export const SO = `import { createServerOnlyFn } from '@tanstack/react-start'\n`
export const SF = `import { createServerFn } from '@tanstack/react-start'\n`

/** The files every row may import: a server module, a recorder, a client module, a module that registers when it runs. */
const support = {
  'db.server.ts': `const value = () => ({ query: () => 's', s1: 's', secret: 's', unused: 1, value: 'dep', toString: () => 'sv' })
export const getServerDb = value
export const getServerDefault = value
export const getServerVal = value
export const getServerObj = value
export const getServerKey = value
export const createServerClient = value
`,
  'record.ts': `export const calls: Array<string> = []
export const record = (name: string) => {
  calls.push(name)
  return name
}
export function steps(n: number): any {
  let i = 0
  return {
    [Symbol.iterator]() { return this },
    next() { calls.push('next'); return i < n ? { value: i++, done: false } : { value: undefined, done: true } },
    return() { calls.push('return'); return { done: true } },
  }
}
export function getters(): any {
  return {
    get s() { calls.push('get s'); return undefined },
    get kept() { calls.push('get kept'); return 'k' },
  }
}
`,
  'client-dep.ts': `export const keptFn = () => 'kept'
export const sharedDef = () => ({ ok: 'ok', s1: 's' })
export const sharedKey = () => 'shared'
export const h = (type: unknown) => type
`,
  'register.ts': `import { record } from './record'
record('registered')
export class Registered {}
`,
}

/** What the source's `run()` gives: its value or the name of what it throws, and what it recorded. */
export type Expected = ({ value: unknown } | { throws: string }) & {
  calls?: Array<string>
}

export interface Row {
  name: string
  code: string
  expected: Expected
  /** The client does not load `./db.server`. */
  gone?: true
  /** A marker string no client output holds. */
  absent?: string
}

/**
 * Serves a row's module and checks the client against the source: every
 * environment serves it, the SSR environment evaluates it, and one page run
 * imports it (without a page error), calls `run()` and reads what it
 * recorded; the row's loads are that run's (`StartCase.loadsOf`).
 */
export async function checkRow(
  host: StartHost,
  { code, expected, gone, absent }: Row,
) {
  const startCase = await host.case({ 'module.tsx': code, ...support })
  const client = await startCase.served('module.tsx', 'client')
  await startCase.served('module.tsx', 'ssr')
  await startCase.ssr()
  const run = await startCase.client<{
    settled: PageSettled
    calls: Array<string>
  }>(`const settled = await settle(() => module.run())
return { settled, calls: [...(await load('record.ts')).calls] }`)
  expect(run.errors, 'page errors').toEqual([])
  const { settled, calls } = run.result
  expect({
    ...('thrown' in settled
      ? { throws: settled.thrown.name }
      : { value: settled.value }),
    ...(calls.length > 0 ? { calls } : {}),
  }).toEqual(expected)
  if (gone) {
    expectNotLoaded(startCase.loadsOf(run), ['./db.server'])
  }
  if (absent !== undefined) {
    expect(client).not.toContain(absent)
  }
}
