/**
 * Harness controls (outside the compiler corpus), moved unchanged from
 * known-bugs-start-compiler.test.ts (workstream B2): they check the legacy
 * internal harness (`./legacy/regression-helpers`: the provider output, the
 * server-fn report, the module linker), not the compiler. The corpus pins
 * now run through the public Start host (tests/start-host.ts); a control of
 * its misplacement check is at the end of this file.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  expectNoClientHandler as expectNoClientHandlerOnHost,
  useStartHost,
} from '../regression-helpers'
import {
  callReportedServerFns,
  compileAll,
  compileCode,
  compileFor,
  evaluateModule,
  expectNoClientHandler,
  expectOutputsFreeOfHandler,
  moduleLoads,
  outputs,
  serverOnlyError,
  serverOnlyModule,
  settle,
} from './legacy/regression-helpers'
import type {
  ModuleStub,
  Output,
  OutputResult,
} from './legacy/regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = serverOnlyModule

/**
 * Calls every server fn the client build reports through the provider
 * module and export it names, like the server-function router
 * (`callReportedServerFns`). Returns the compiled outputs and the results of
 * the calls.
 */
async function callServerFns(
  code: string,
  options: {
    directives?: Array<string>
    files?: Record<string, string>
    stubs?: Record<string, ModuleStub>
  } = {},
) {
  const compiled = await compileAll(code, options)
  const results = await callReportedServerFns(
    compiled,
    compiled.serverFns,
    options.stubs,
  )
  return { ...compiled, results }
}

/**
 * Compiles `code` for the client and calls its `read` export: the client
 * must not load the server-only module, and calling the server-only fn
 * must throw the server-only error.
 */
async function expectServerOnlyRead(code: string) {
  const client = (await compileCode('client', code)) ?? code
  expectNotLoaded(await moduleLoads(client), [serverOnly])
  const { read } = await evaluateModule(client, {
    [serverOnly]: { db: { secret: () => 'secret' } },
  })
  expect(settle(() => read())).toEqual(serverOnlyError)
}

describe('harness controls', () => {
  test('callServerFns calls a top-level server fn through its provider', async () => {
    const { results } = await callServerFns(
      `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
      { stubs: { [serverOnly]: { db: { x: () => 'from the server' } } } },
    )
    expect(results).toEqual(['from the server'])
  })

  test('expectNoClientHandler accepts a top-level server fn', async () => {
    await expectNoClientHandler(`${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`)
  })

  describe('expectNoClientHandler checks each output on its own', () => {
    const code = `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`
    // A synthetic rejection at the server fn's line (the helper's control,
    // not what the compiler says).
    const rejection = {
      error: new Error(`createServerFn cannot be used here
  1 | import { createServerFn } from '@tanstack/react-start'
  2 | import { db } from './db.server'
> 3 | export const fn = createServerFn().handler(async () => db.inner())
    |                   ^^^^^^^^^^^^^^`),
    }
    const compileOutputs = async () => {
      const results = {} as Record<Output, OutputResult>
      for (const output of outputs) {
        results[output] = await compileFor(output, code)
      }
      return results
    }

    test('it accepts outputs that each reject the code', async () => {
      await expectOutputsFreeOfHandler(code, {
        client: rejection,
        ssr: rejection,
        provider: rejection,
      })
    })

    test('it accepts a rejecting output next to outputs free of the handler', async () => {
      await expectOutputsFreeOfHandler(code, {
        ...(await compileOutputs()),
        ssr: rejection,
      })
    })

    test('it rejects a client output with the handler body next to rejecting outputs', async () => {
      await expect(
        expectOutputsFreeOfHandler(code, {
          client: { code, serverFns: {} },
          ssr: rejection,
          provider: rejection,
        }),
      ).rejects.toThrow('db.server')
    })

    // Only the client must be free of the handler: the SSR caller may keep
    // it in place.
    test('it accepts an SSR output that keeps the handler in place', async () => {
      await expectOutputsFreeOfHandler(code, {
        ...(await compileOutputs()),
        ssr: { code, serverFns: {} },
      })
    })

    test('it rejects a provider that does not run the reported server fn', async () => {
      const results = await compileOutputs()
      await expect(
        expectOutputsFreeOfHandler(code, {
          ...results,
          client: rejection,
          provider: { code: 'export {}', serverFns: {} },
        }),
      ).rejects.toThrow()
    })

    test('it rejects a rejection that does not point at the server fn', async () => {
      await expect(
        expectOutputsFreeOfHandler(code, {
          ...(await compileOutputs()),
          client: {
            error: new Error('createServerFn cannot be used here'),
          },
        }),
      ).rejects.toThrow('line 3')
    })
  })

  test.each([
    {
      name: 'a nested createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return createServerOnlyFn(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a top-level renamed createServerOnlyFn',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const read = serverOnly(() => db.secret())`,
    },
  ])(
    'expectServerOnlyRead accepts $name compiled for the client',
    async ({ code }) => {
      await expectServerOnlyRead(code)
    },
  )
})

describe('the module linker', () => {
  const pragmaModule = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from './jsx'
import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => h('p', null))
export const Card = () => <div />`
  const pragmaStubs = { './jsx': { h: (type: string) => `h(${type})` } }

  // Control for the JSX pragma pin below (same harness).
  test('evaluateModule renders JSX through the factory of a classic JSX pragma', async () => {
    const { Card } = await evaluateModule(pragmaModule, pragmaStubs)
    expect(Card()).toBe('h(div)')
  })
})

describe('expectNoClientHandler on the public Start host', () => {
  const host = useStartHost()
  test('it accepts a top-level server fn', async () => {
    await expectNoClientHandlerOnHost(
      await host(),
      `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`,
      { read: 'module.fn' },
    )
  })
  test('it rejects a client that loads the server-only module', async () => {
    await expect(
      expectNoClientHandlerOnHost(
        await host(),
        `import { db } from './db.server'
export const fn = async () => db.inner()`,
      ),
    ).rejects.toThrow('forbidden modules that loaded')
  })
})
