/**
 * Which modules Start compiles (`startCompileScope`) and which dependency
 * modules its summaries never read (`opaquePackageModule`): text tests on the
 * module's path and code, before any parse.
 */
import { describe, expect, test } from 'vitest'
import { opaquePackageModule, startCompileScope } from '../src/compiler/scope'

const NM = '/app/node_modules/lib/dist/index.js'

describe('startCompileScope', () => {
  const compiles = startCompileScope(null)

  test("the app's own modules are compiled; a dependency only when its text names a Start export, a builder's terminal call or the Hydrate boundary", () => {
    expect(compiles('/app/src/a.ts', `export const a = 1\n`)).toBe(true)
    expect(compiles(NM, `export const a = 1\n`)).toBe(false)
    expect(
      compiles(NM, `import{createServerFn as e}from"@tanstack/react-start"\n`),
    ).toBe(true)
    expect(compiles(NM, `export const f = x.handler(() => 1)\n`)).toBe(true)
    expect(compiles(NM, `export const H = () => <Hydrate>x</Hydrate>\n`)).toBe(
      true,
    )
  })
})

describe('opaquePackageModule', () => {
  const opaque = opaquePackageModule(null)

  test('an ordinary dependency module is opaque; one that names a Start export or re-exports another module is read', () => {
    expect(opaque(NM, `export const a = 1\n`)).toBe(true)
    expect(opaque(NM, `module.exports = require('./cjs/lib.js')\n`)).toBe(true)
    expect(opaque('/app/src/a.ts', `export const a = 1\n`)).toBe(false)
    expect(
      opaque(NM, `import { createServerFn } from '@tanstack/react-start'\n`),
    ).toBe(false)
    expect(opaque(NM, `export * from './server.js'\n`)).toBe(false)
    expect(opaque(NM, `export * as ns from './server.js'\n`)).toBe(false)
    expect(
      opaque(NM, `export {\n  a,\n  b as c,\n} from './server.js'\n`),
    ).toBe(false)
    // a type-only re-export carries no value
    expect(opaque(NM, `export type { A } from './types'\n`)).toBe(true)
  })
})
