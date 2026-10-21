/**
 * Server fn ids (SPEC J4.4, G4) in a dev server of the public Start host
 * (`./start-host`): the client's server fn reaches the handler it was
 * created with, and each server fn of a module with several reaches its own
 * handler, from the client (through the dev server) and from server code.
 * Ids are opaque: they are observed through the public `url` of the client's
 * server fns and the handler a call reaches, never generated names.
 *
 * Build ids (J4.4: deterministic for an unchanged project, a custom
 * `generateFunctionId`, colliding custom ids) and relocation to another
 * root are build clauses: integration/start-compiler-build-determinism.test.ts
 * and integration/start-compiler-build-ids.test.ts (real `vite build` and
 * Start's preview server). Windows module ids (Rsbuild on Windows) are not
 * reachable through a POSIX host: their rows stay as implementation
 * controls in outside-compiler-corpus/start-compiler-determinism-internal.test.ts
 * until a Windows CI build covers them (N24).
 * Source: oracle-gaps H3 (round 2); FIX-PLAN S01, S02.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  callFromClient,
  callOnServer,
  serveCase,
  serverFnUrls,
  useStartHost,
} from './regression-helpers'

const host = useStartHost()
beforeAll(async () => {
  await (await host()).page()
}, 60_000)

const serverFnModule = (name: string, value: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => '${value}')`

describe('server fn ids', () => {
  test('the client and the server agree on the id: a call reaches its handler', async () => {
    const served = await serveCase(
      await host(),
      { 'fns.ts': serverFnModule('fn', 'from the server') },
      { file: 'fns.ts' },
    )
    expect(await serverFnUrls(served, 'module', { file: 'fns.ts' })).toEqual([
      expect.any(String),
    ])
    expect(
      await callFromClient(served, 'module.fn', undefined, { file: 'fns.ts' }),
    ).toBe('from the server')
    expect(
      await callOnServer(served, 'module.fn', undefined, { file: 'fns.ts' }),
    ).toBe('from the server')
  })

  // Each server fn of a module gets an id of its own, and the server runs
  // the handler of that id. (With one custom id for all of them, a build
  // clause: integration/start-compiler-build-ids.test.ts.)
  test('each server fn of a module with several reaches its own handler (default ids)', async () => {
    const served = await serveCase(
      await host(),
      {
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const a = createServerFn().handler(async () => 'from a')
export const b = createServerFn().handler(async () => 'from b')
export const c = createServerFn().handler(async () => 'from c')`,
      },
      { file: 'fns.ts' },
    )
    expect(
      await serverFnUrls(served, 'module', { file: 'fns.ts' }),
    ).toHaveLength(3)
    const called: Record<string, unknown> = {}
    for (const name of ['a', 'b', 'c']) {
      called[name] = await callFromClient(served, `module.${name}`, undefined, {
        file: 'fns.ts',
      })
      expect(
        await callOnServer(served, `module.${name}`, undefined, {
          file: 'fns.ts',
        }),
        `${name} called by server code`,
      ).toBe(called[name])
    }
    expect(called).toEqual({ a: 'from a', b: 'from b', c: 'from c' })
  })
})
