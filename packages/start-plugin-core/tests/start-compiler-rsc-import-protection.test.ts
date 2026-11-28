/**
 * Import protection's `'use client'` exception on the compile-level RSC tier
 * (Vite, `createStartHost({ rsc: true, ... })`): a `'use client'` module's
 * imports are judged where its code runs, not in the provider (SPEC J6.1;
 * the dev and build apps are react-start-rsc's rsc-use-client-*). The other
 * RSC rows: start-compiler-rsc.test.ts.
 *
 * Its host is unshared (an `onViolation` callback) and runs in a process of
 * its own (`unitAloneTests` in vite.config.ts): `@vitejs/plugin-rsc` keeps
 * the runner SSR reaches the provider through in one process-global, set by
 * the last RSC dev server created, so a shared RSC host of the same process
 * could no longer call its provider once this one closed.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from './file-end'
import { createStartHost } from './start-host'
import type { StartHost } from './start-host'

describe("Vite with RSC: import protection's 'use client' exception", () => {
  const violations: Array<{
    env: string
    importer: string
    specifier: string
  }> = []
  let host: StartHost
  const openHost = closeAfterAll()
  beforeAll(async () => {
    host = await openHost(() =>
      createStartHost({
        rsc: true,
        start: {
          importProtection: {
            behavior: 'mock',
            onViolation: (info: {
              env: string
              importer: string
              specifier: string
            }) => {
              violations.push(info)
            },
          },
        },
      }),
    )
  }, 60_000)

  // SPEC J6.1: the provider compiles the module, which the RSC plugin
  // replaces by client references: nothing of its code runs there, so its
  // `.client` import is no violation in the rsc environment; SSR runs it,
  // so it is one there (and SSR gets the mock).
  test("a 'use client' module's .client import is judged in SSR, not in the rsc environment", async () => {
    const c = await host.case({
      'label.client.ts': `export const label = () => 'MARK_CLIENT_LABEL'\n`,
      'module.tsx': `'use client'
import { label } from './label.client'
export function Box() {
  return <span>{label()}</span>
}
`,
    })
    const reported = () =>
      violations
        .filter(({ importer }) => importer.includes(c.dir))
        .map(({ env, specifier }) => `${env} ${specifier}`)
    const rsc = await c.rsc()
    expect(rsc.Box.$$typeof).toBe(Symbol.for('react.client.reference'))
    expect(reported()).toEqual([])
    await c.ssr()
    expect(reported()).toEqual(['ssr ./label.client'])
  })
})
