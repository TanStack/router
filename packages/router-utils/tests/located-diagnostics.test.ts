import { describe, expect, it } from 'vitest'
import {
  locateDiagnostics,
  locatedDiagnostic,
  locatedError,
} from '../src/compiler'
import type { LocatedDiagnosticsOptions } from '../src/compiler'

class WebpackError extends Error {}

const options: LocatedDiagnosticsOptions = {
  field: 'test.diagnostics',
  errorName: 'TestError',
  warningName: 'TestWarning',
}

/** A module whose loader recorded `records`. */
const moduleOf = (
  name: string,
  records: Array<ReturnType<typeof locatedDiagnostic>>,
) => ({
  identifier: () => name,
  buildInfo: { [options.field]: records },
})

/** What a bundler reports for a loader's emitted warning or error: the message, wrapped, no location. */
const reported = (module: unknown, message: string) => ({
  message: `Module Warning (from ./loader.cjs):\n${message}`,
  module,
})

const summary = (list: Array<unknown>) =>
  (list as Array<Error & { loc?: unknown; module?: unknown }>).map((e) => ({
    name: e.name,
    loc: e.loc,
    message: e.message,
  }))

describe('locateDiagnostics', () => {
  it('replaces each reported diagnostic of a module by one at its position, in order', () => {
    const first = locatedDiagnostic('warning', 'same text', {
      line: 2,
      column: 4,
    })
    const second = locatedDiagnostic('warning', 'same text', {
      line: 5,
      column: 0,
    })
    const error = locatedDiagnostic('error', 'broken', { line: 3, column: 1 })
    const a = moduleOf('a', [first, error, second])
    const other = { message: 'unrelated', module: { identifier: () => 'b' } }
    const compilation = {
      errors: [reported(a, error.message)],
      warnings: [
        reported(a, first.message),
        other,
        reported(a, second.message),
      ],
    }
    locateDiagnostics(compilation, WebpackError, options)
    expect(summary(compilation.warnings)).toEqual([
      {
        name: 'TestWarning',
        loc: { start: { line: 2, column: 5 } },
        message: 'same text',
      },
      { name: undefined, loc: undefined, message: 'unrelated' },
      {
        name: 'TestWarning',
        loc: { start: { line: 5, column: 1 } },
        message: 'same text',
      },
    ])
    expect(summary(compilation.errors)).toEqual([
      {
        name: 'TestError',
        loc: { start: { line: 3, column: 2 } },
        message: 'broken',
      },
    ])
    expect((compilation.warnings[0] as { module?: unknown }).module).toBe(a)
  })

  it("replaces a module's failure by one located error per recorded error", () => {
    const one = locatedDiagnostic('error', 'one', { line: 1, column: 0 })
    const two = locatedDiagnostic('error', 'two', undefined)
    const a = moduleOf('a', [one, two])
    const compilation = {
      errors: [reported(a, `Failure: ${one.message}\n${two.message}`)],
      warnings: [],
    }
    locateDiagnostics(compilation, WebpackError, {
      ...options,
      failureName: 'Failure',
    })
    expect(summary(compilation.errors)).toEqual([
      {
        name: 'TestError',
        loc: { start: { line: 1, column: 1 } },
        message: 'one',
      },
      { name: 'TestError', loc: undefined, message: 'two' },
    ])
  })

  // Rsbuild prints a located error's `file` when it has one, else the
  // module's identifier: a split chunk's diagnostic names the user's file
  it("names the file of a derived module without its query, and leaves a plain module's to the bundler", () => {
    const d = locatedDiagnostic('error', 'denied', { line: 3, column: 19 })
    const split = locatedError(
      WebpackError,
      {
        identifier: () => 'x',
        resource: '/app/src/routes/index.tsx?tsr-split=component',
      },
      d,
      options,
    ) as Error & { file?: string }
    expect(split.file).toBe('/app/src/routes/index.tsx')
    const plain = locatedError(
      WebpackError,
      { identifier: () => 'y', resource: '/app/src/a.ts' },
      d,
      options,
    ) as Error & { file?: string }
    expect(plain.file).toBeUndefined()
  })
})
