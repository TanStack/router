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
 * - a generator that embeds `functionName` in the id gives each server fn
 *   of a module its own working id: two server fns of one name in one
 *   module, and server fns nested in functions;
 * - the same project at another root builds correctly (relocation is
 *   correctness, not id equality: G4).
 * Moved from the unit test start-compiler-determinism.test.ts, which
 * compiled through the internal compiler; its Windows-path rows are not
 * reachable through a POSIX host.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import {
  callFromClient,
  callOnServer,
  createStartHost,
  inPage,
  serverFnUrls,
} from '../regression-helpers'
import type { StartCase, StartHost } from '../regression-helpers'

/**
 * The host defaults these tests use: no import
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
  /** The names the custom function received for named-ids.ts. */
  const namesReceived = new Set<string>()
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
              // (any other id fails the build:
              // start-build-function-id-url.test.ts)
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
            if (filename.includes('named-ids')) {
              namesReceived.add(functionName)
              // the documented inputs, readable: the file and the name
              return `${filename.replace(/[^A-Za-z0-9]+/g, '-')}-${functionName}`
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
    cases.named = await host.case({
      'named-ids.ts': `import { createServerFn } from '@tanstack/react-start'
let first
let second
let third
{
  const twice = createServerFn().handler(async () => 'the first twice')
  first = twice
}
{
  const twice = createServerFn().handler(async () => 'the second twice')
  second = twice
}
{
  const twice = createServerFn().handler(async () => 'the third twice')
  third = twice
}
export { first, second, third }
export const $dollar = createServerFn().handler(async () => 'dollar')
export const _under = createServerFn().handler(async () => 'under')
export const café = createServerFn().handler(async () => 'café')
export const again = (() => {
  const _under = createServerFn().handler(async () => 'under again')
  return _under
})()
export function outer() {
  const fn = createServerFn().handler(async () => 'in outer')
  function inner() {
    const fn = createServerFn().handler(async () => 'in inner')
    return fn
  }
  return { fn, inner }
}
`,
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

  // The generator embeds the name it receives: each server fn of the
  // module has its own url, and calling it from the browser runs its own
  // handler.
  test('embedding functionName: server fns of one name in one module each reach their own handler', async () => {
    const calls = {
      first: 'module.first',
      second: 'module.second',
      third: 'module.third',
      dollar: 'module.$dollar',
      under: 'module._under',
      underAgain: 'module.again',
      cafe: 'module.café',
      outer: 'module.outer().fn',
      inner: 'module.outer().inner()',
    }
    const urls = await inPage<Array<string>>(
      cases.named!,
      `return [${Object.values(calls).join(', ')}].map((fn) => fn.url)`,
      { file: 'named-ids.ts' },
    )
    expect(new Set(urls).size, urls.join(', ')).toBe(9)
    const called: Record<string, unknown> = {}
    for (const [name, fn] of Object.entries(calls)) {
      called[name] = await callFromClient(cases.named!, fn, undefined, {
        file: 'named-ids.ts',
      })
    }
    expect(called).toEqual({
      first: 'the first twice',
      second: 'the second twice',
      third: 'the third twice',
      dollar: 'dollar',
      under: 'under',
      underAgain: 'under again',
      cafe: 'café',
      outer: 'in outer',
      inner: 'in inner',
    })
  })

  // functionName is the handler name earlier versions generated (a custom
  // generator's ids survive the upgrade): the variable's name, numbered in
  // source order when the module repeats it (a numbered name loses its
  // leading `_`, as it did), with `_` for a character outside
  // [A-Za-z0-9_$], so that an id embedding it is a URL path segment.
  test('functionName is the generated handler name of earlier versions', () => {
    expect([...namesReceived].sort()).toEqual(
      [
        '$dollar_createServerFn_handler',
        '_under_createServerFn_handler',
        'caf__createServerFn_handler',
        'fn_createServerFn_handler',
        'fn_createServerFn_handler_1',
        'twice_createServerFn_handler',
        'twice_createServerFn_handler_1',
        'twice_createServerFn_handler_2',
        'under_createServerFn_handler_1',
      ].sort(),
    )
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
