/**
 * What the Start compiler reports: compile error messages, and the checks
 * that a misplaced server fn is rejected or kept off the client.
 * Re-exported by `regression-helpers.ts`.
 */
import { stripVTControlCharacters } from 'node:util'
import { expect } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { identifiesEnvRestriction } from '@tanstack/compiler-test-utils/diagnostics'
import type { Environment } from '@tanstack/compiler-test-utils/diagnostics'
import type { ServerFn } from '../src/start-compiler/types'
import {
  Thrown,
  callReportedServerFns,
  compileFor,
  outputs,
} from './regression-helpers'
import type { Output } from './regression-helpers'
import { importSources } from './imports'

/**
 * The message of a compile error without its code frame. A code frame quotes
 * the source lines, so matching the whole message would also match the input
 * code, whatever the error.
 */
export function compileErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return stripVTControlCharacters(message)
    .split('\n')
    .flatMap((line) => {
      // A quoted source line: `  12 | code` or `> 12 | code`.
      if (/^\s*>?\s*\d+\s*\|/.test(line)) {
        return []
      }
      // A marker line, which may end with the message: `   | ^^^ message`.
      const marker = /^\s*\|\s*\^*\s*(.*)$/.exec(line)
      return (marker ? marker[1]! : line).trim() || []
    })
    .join('\n')
}

/** Server-only module the server fns of the misplacement tests read. */
export const serverOnlyModule = './db.server'

/**
 * A clear compile error rejecting a createServerFn that is not assigned to a
 * top-level variable, matched against the message without its code frame
 * (`compileErrorMessage`).
 */
export const misplacedServerFnRejection =
  /createServerFn\b[^]*\b(top[- ]level|module[- ]?(scope|level)|nested|assigned to a (top[- ]level )?variable)/i

/** What compiling a module for one output gave: its code, or an error. */
export type OutputResult =
  | { code: string | null; serverFns: Record<string, ServerFn> }
  | { error: unknown }

/**
 * Each output, on its own, either rejects the code with a clear
 * createServerFn error (not the internal statement-list crash), or is a
 * valid module: the client is free of the misplaced handler (it neither
 * imports the server-only module, `serverOnlyModule`, nor contains the
 * handler body, `db.inner()`), the SSR caller may keep the handler in place
 * or call it through the provider, and the provider exports and runs every
 * server fn the callers that compiled report, the misplaced one included.
 * One output rejecting the code does not excuse another.
 */
export async function expectOutputsFreeOfHandler(
  code: string,
  results: Record<Output, OutputResult>,
) {
  const compiled: Partial<Record<Output, string>> = {}
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = results[output]
    if ('error' in result) {
      const message = compileErrorMessage(result.error)
      expect(message, output).toMatch(misplacedServerFnRejection)
      expect(message, output).not.toMatch(
        /Expected createServerFn declaration in a statement list/,
      )
      continue
    }
    compiled[output] = result.code ?? code
    if (output !== 'provider') {
      serverFns = { ...serverFns, ...result.serverFns }
    }
  }
  if (compiled.client !== undefined) {
    expect(importSources(compiled.client), 'client').not.toContain(
      serverOnlyModule,
    )
    expect(compiled.client, 'client').not.toContain('db.inner()')
  }
  const errors: Partial<Record<Output, Array<string>>> = {}
  for (const [output, module] of Object.entries(compiled)) {
    errors[output as Output] = await getModuleErrors(module)
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(compiled).map((output) => [output, []])),
  )
  if (
    compiled.provider !== undefined &&
    (compiled.client !== undefined || compiled.ssr !== undefined)
  ) {
    const called = await callReportedServerFns(
      { ssr: compiled.ssr, provider: compiled.provider },
      serverFns,
      {
        [serverOnlyModule]: { db: { inner: () => 'inner', top: () => 'top' } },
      },
    )
    expect(called).toContain('inner')
  }
}

/**
 * Compiles every output of `code`, each on its own (an output may reject the
 * code), and checks `expectOutputsFreeOfHandler`.
 */
export async function expectNoClientHandler(code: string) {
  const results = {} as Record<Output, OutputResult>
  for (const output of outputs) {
    results[output] = await compileFor(output, code).catch(
      (error: unknown) => ({ error }),
    )
  }
  await expectOutputsFreeOfHandler(code, results)
}

/**
 * What `settle` gives for a `createServerOnlyFn` called outside the server
 * (J4.10): it threw an error restricting the call to the server, whatever
 * its prose (`identifiesEnvRestriction`). An asymmetric matcher: compare
 * with `toEqual`.
 */
export const serverOnlyError = thrownEnvRestriction('server')
/** `serverOnlyError` for a `createClientOnlyFn` called outside the client. */
export const clientOnlyError = thrownEnvRestriction('client')

function thrownEnvRestriction(env: Environment) {
  return expect.toSatisfy(
    (value: unknown) =>
      value instanceof Thrown && identifiesEnvRestriction(value.error, env),
    `a call that throws an error restricting it to the ${env}`,
  )
}
