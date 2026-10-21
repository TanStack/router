/**
 * Server fn ids of production builds (SPEC J4.4, G4) through the public
 * Start host in production mode (`createStartHost({ serve: false })`: real
 * `vite build` with the Start plugin's documented `serverFns` options and
 * Start's preview server; the client in the hydrated production page):
 * - the id a custom `generateFunctionId` returns is the one the client calls
 *   (its public `url`) and the server answers to; which spelling of the file
 *   name it receives is not specified (J4.4);
 * - a `generateFunctionId` returning `undefined` falls back to a working id;
 * - server fns given the same custom id (in one module, or in two) still
 *   each reach their own handler, from the client and from server code;
 * - the same project at another root builds correctly (relocation is
 *   correctness, not id equality: G4).
 * Moved from the unit test start-compiler-determinism.test.ts, which
 * compiled through the internal compiler; its Windows-path rows are
 * implementation controls (outside-compiler-corpus/
 * start-compiler-determinism-internal.test.ts, N24).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import {
  callFromClient,
  callOnServer,
  createStartHost,
  serverFnUrls,
} from '../regression-helpers'
import type { StartCase, StartHost } from '../regression-helpers'

/**
 * The host defaults of the B2 lead's branch (until it is merged): no import
 * protection (its dev mock would hide a leaked server import from the
 * client's loads) and an app tsconfig with `verbatimModuleSyntax` (without
 * it, Vite's TypeScript transform drops unreferenced imports after the
 * compiler and hides leaks).
 */
const hostTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    verbatimModuleSyntax: true,
  },
}
const hostDefaults = {
  start: { importProtection: { enabled: false } },
  files: { 'tsconfig.json': JSON.stringify(hostTsconfig) },
}

const serverFnModule = (name: string, value: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => '${value}')
`

/** What a call from the client and from server code give (equal). */
async function callBothWays(startCase: StartCase, fn: string, file: string) {
  const client = await callFromClient(startCase, fn, undefined, { file })
  expect(
    await callOnServer(startCase, fn, undefined, { file }),
    `${fn} called by server code`,
  ).toEqual(client)
  return client
}

describe('a custom generateFunctionId', () => {
  /** The ids the custom function returned. */
  const returned: Array<string> = []
  let host: StartHost | undefined
  const cases: Record<string, StartCase> = {}

  beforeAll(async () => {
    // One build: each case directory gets its own id policy.
    host = await createStartHost({
      serve: false,
      files: hostDefaults.files,
      start: {
        ...hostDefaults.start,
        serverFns: {
          generateFunctionId: ({
            filename,
            functionName,
          }: {
            filename: string
            functionName: string
          }) => {
            if (filename.includes('custom-ids')) {
              // URL-safe: the id is a path segment of the server fn's url
              // (an id with a '/' is not routed back to its handler by
              // Start's runtime: a runtime limitation, not this test's
              // subject)
              const id = `custom_${Buffer.from(`${filename}:${functionName}`).toString('hex')}`
              returned.push(id)
              return id
            }
            if (filename.includes('no-ids')) {
              return undefined
            }
            if (filename.includes('same-ids')) {
              return 'same-id'
            }
            return undefined
          },
        },
      },
    })
    cases.custom = await host.case({
      'custom-ids.ts': serverFnModule('fn', 'from the server'),
    })
    cases.fallback = await host.case({
      'no-ids.ts': serverFnModule('fn', 'from the server'),
    })
    cases.several = await host.case({
      'same-ids.ts': `import { createServerFn } from '@tanstack/react-start'
export const a = createServerFn().handler(async () => 'from a')
export const b = createServerFn().handler(async () => 'from b')
export const c = createServerFn().handler(async () => 'from c')
`,
    })
    cases.colliding = await host.case({
      'same-ids-a.ts': serverFnModule('a', 'from a'),
      'same-ids-b.ts': serverFnModule('b', 'from b'),
    })
    await host.preview()
  }, 60_000)
  afterAll(() => host?.close())

  test('gives the id the client calls and the server answers to', async () => {
    const [url] = await serverFnUrls(cases.custom!, 'module', {
      file: 'custom-ids.ts',
    })
    expect(url).toEqual(expect.any(String))
    expect(
      returned.some((id) => url!.endsWith(id)),
      `the url ${url} carries one of the ids the function returned: ${returned.join(', ')}`,
    ).toBe(true)
    expect(
      await callBothWays(cases.custom!, 'module.fn', 'custom-ids.ts'),
    ).toBe('from the server')
  })

  test('that returns undefined falls back to a working id', async () => {
    expect(
      await serverFnUrls(cases.fallback!, 'module', { file: 'no-ids.ts' }),
    ).toEqual([expect.any(String)])
    expect(await callBothWays(cases.fallback!, 'module.fn', 'no-ids.ts')).toBe(
      'from the server',
    )
  })

  // The server gives each server fn of a module the id the client gave it,
  // also when the custom function gives them all the same id.
  test('giving one id to every server fn of a module: each reaches its own handler', async () => {
    expect(
      await serverFnUrls(cases.several!, 'module', { file: 'same-ids.ts' }),
    ).toHaveLength(3)
    const called: Record<string, unknown> = {}
    for (const name of ['a', 'b', 'c']) {
      called[name] = await callBothWays(
        cases.several!,
        `module.${name}`,
        'same-ids.ts',
      )
    }
    expect(called).toEqual({ a: 'from a', b: 'from b', c: 'from c' })
  })

  // Two server fns of two modules get the same custom id: the build tells
  // them apart, and each environment pairs each with its own handler.
  test('colliding custom ids of two modules stay paired', async () => {
    const urls = [
      ...(await serverFnUrls(cases.colliding!, 'module', {
        file: 'same-ids-a.ts',
      })),
      ...(await serverFnUrls(cases.colliding!, 'module', {
        file: 'same-ids-b.ts',
      })),
    ]
    expect(new Set(urls).size).toBe(2)
    expect(
      await callBothWays(cases.colliding!, 'module.a', 'same-ids-a.ts'),
    ).toBe('from a')
    expect(
      await callBothWays(cases.colliding!, 'module.b', 'same-ids-b.ts'),
    ).toBe('from b')
  })
})

describe('relocation', () => {
  const hosts: Array<StartHost> = []
  afterAll(async () => {
    for (const host of hosts) {
      await host.close()
    }
  })

  // Two apps at two roots, the same project: each builds a working app (its
  // client calls reach their handlers); only the results must agree, not
  // the opaque ids.
  test('the same project at another root compiles correctly: the client and the server agree on the id', async () => {
    await expectRelocatable(
      ['first root', 'second root'],
      async () => {
        const host = await createStartHost({ ...hostDefaults, serve: false })
        hosts.push(host)
        const startCase = await host.case({
          'fns.ts': serverFnModule('fn', 'from the server'),
        })
        await host.preview()
        return {
          urls: await serverFnUrls(startCase, 'module', { file: 'fns.ts' }),
          called: await callBothWays(startCase, 'module.fn', 'fns.ts'),
        }
      },
      {
        check: (result) => {
          expect(result.urls).toEqual([expect.any(String)])
        },
        portable: (result) => result.called,
      },
    )
  }, 60_000)
})
