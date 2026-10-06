/**
 * Scenarios ported from Turbopack's tree-shaker analyzer fixtures
 * (vercel/next.js `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`,
 * MIT). Turbopack splits a module into one part per export and computes which
 * statements each part needs; here the server function provider and the
 * callers play the parts, and the tests check that each output keeps the
 * statements and imports it needs, in their original order.
 */
import { describe, expect, test } from 'vitest'
import { compileAll } from './regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

describe('ported Turbopack tree-shaker fixtures', () => {
  // Source: analyzer/import-with-clause
  test('each output keeps the import attributes of the imports it reads', async () => {
    const compiled =
      await compileAll(`${head}import config from './config.json' with { type: 'json' }
import secrets from './secrets.json' with { type: 'json' }
export const fn = createServerFn().handler(async () => secrets.key)
export const title = config.title
`)
    const json = (file: string) =>
      new RegExp(
        String.raw`import \w+ from ['"]\./${file}\.json['"] with \{ type: ['"]json['"] \}`,
      )
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).toMatch(json('config'))
      expect(caller).not.toContain('secrets.json')
    }
    expect(compiled.provider).toMatch(json('secrets'))
    expect(compiled.provider).not.toContain('config.json')
  })

  // Source: analyzer/write-order, analyzer/shared-2 and
  // analyzer/shared-and-side-effects
  test('the provider runs the writes a handler-read declaration depends on in source order', async () => {
    const compiled = await compileAll(`${head}import { db } from './db.server'
const order: Array<string> = []
order.push('a')
const conn = db.connect(order)
order.push('c')
export const fn = createServerFn().handler(async () => conn.query())
export const log = order
`)
    const { provider } = compiled
    const positions = [
      "order.push('a')",
      'db.connect(order)',
      "order.push('c')",
    ].map((statement) => provider.indexOf(statement))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).toContain("order.push('a')")
      expect(caller).not.toContain('db.connect')
    }
  })
})
