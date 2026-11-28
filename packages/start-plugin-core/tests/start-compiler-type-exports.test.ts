/**
 * Type-only exports (`export type { X }`, `export { type X }`,
 * `export type { X } from '…'`) have no runtime meaning: Start's compiler
 * removes them from what it emits, client and server, as `main` does
 * (`stripTypeExports`). A Babel plugin that runs after Start's (React
 * Compiler through `@rolldown/plugin-babel`, which parses TypeScript and
 * JSX) then parses every module the app serves; an export of a type import
 * the compiler removed with the server-only code would be one Babel's parser
 * rejects ("Export 'X' is not defined"), failing the app where `main` serves
 * it. Corpus shape of #8817: brain-dump `src/api/claude-tasks.ts`
 * (`import { claudeTasks, type ClaudeTask } from '../lib/schema'` and
 * `export type { ClaudeTask }` next to server fns). Route files: router-plugin
 * tests/code-splitter-type-exports.test.ts.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import babel from '@rolldown/plugin-babel'
// @ts-expect-error -- the preset ships no type declarations
import typescript from '@babel/preset-typescript'
import { closeAfterAll } from './file-end'
import {
  callFromClient,
  callOnServer,
  createStartHost,
  inPage,
} from './regression-helpers'
import type { StartHost } from './regression-helpers'

let host: StartHost
const openHost = closeAfterAll()
beforeAll(async () => {
  host = await openHost(() =>
    createStartHost({
      plugins: [
        babel({
          presets: [[typescript, { allExtensions: true, isTSX: true }]],
        }),
      ],
    }),
  )
}, 60_000)
beforeAll(async () => {
  await host.page()
}, 60_000)

/** The module the cases import: server-only code, types, a label. */
const rows = `export const readRows = () => [{ id: 1 }]
export type Row = { id: number }
export type Shape = { s: string }
export const label = 'MARK_LABEL'
`

/** A module whose server fn reads `readRows` (server-only on the client). */
const module = (
  imports: string,
  exports: string,
) => `import { createServerFn } from '@tanstack/react-start'
${imports}
${exports}
export const getRows = createServerFn().handler(async (): Promise<Array<Row>> => readRows())
`

const cases = [
  {
    name: '`export type { X }` of an inline type import',
    code: module(
      `import { readRows, type Row } from './rows'`,
      'export type { Row }',
    ),
    label: null,
  },
  {
    // whole-PR review of the declarations lane
    name: '`export default X` of an inline type import',
    code: module(
      `import { readRows, type Row } from './rows'`,
      'export default Row',
    ),
    label: null,
  },
  {
    name: '`export { type X, y }` of an inline type import (y stays)',
    code: module(
      `import { readRows, type Row } from './rows'
import { label } from './rows'`,
      'export { type Row, label }',
    ),
    label: 'MARK_LABEL',
  },
  {
    name: '`export type { X } from` and `export { y, type X } from` (y stays)',
    code: module(
      `import { readRows } from './rows'
import type { Row } from './rows'`,
      `export type { Shape } from './rows'
export { label, type Row as Alias } from './rows'`,
    ),
    label: 'MARK_LABEL',
  },
]

describe.each(cases)(
  'a module with $name, through a Babel plugin after Start',
  ({ code, label }) => {
    // (one case for both tests: each environment compiles it once)
    let written: ReturnType<StartHost['case']> | undefined
    const caseOf = async () =>
      (written ??= host.case({ 'module.tsx': code, 'rows.ts': rows }))

    test('works on the client', async () => {
      const startCase = await caseOf()
      expect(await callFromClient(startCase, 'module.getRows')).toEqual([
        { id: 1 },
      ])
      expect(await inPage(startCase, 'return module.label ?? null')).toBe(label)
    })

    test('works on the server', async () => {
      const startCase = await caseOf()
      expect(await callOnServer(startCase, 'module.getRows')).toEqual([
        { id: 1 },
      ])
      expect((await startCase.ssr()).label ?? null).toBe(label)
    })
  },
)
