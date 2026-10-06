/**
 * Known createServerFn bugs found by porting the Next.js server actions
 * transform fixtures (vercel/next.js, MIT):
 * crates/next-custom-transforms/tests/fixture/server-actions.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { describe, expect, test } from 'vitest'
import { compileStartModule } from '../compile-start-module'
import { getModuleErrors } from '../validate-module'

describe('known createServerFn bugs ported from Next.js server actions', () => {
  // server-graph/3, server-graph/4 (module-level directives)
  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module, although it only holds server code. In an
  // RSC build the provider environment turns every export of a `'use client'`
  // module into a client reference that throws when called on the server.
  // Impact: a server fn declared in a `'use client'` file cannot run in RSC
  // apps. Remove `.fails` once fixed.
  test.fails(
    "the provider of a 'use client' module is not a client module",
    async () => {
      const provider = await compileStartModule({
        env: 'server',
        provider: true,
        code: `'use client'
import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
      })
      expect(provider).not.toBeNull()
      expect(await getModuleErrors(provider!)).toEqual([])
      expect(provider).toMatch(/export\s*\{\s*fn_createServerFn_handler\s*\}/)
      expect(provider).not.toMatch(/['"]use client['"]/)
    },
  )
})
