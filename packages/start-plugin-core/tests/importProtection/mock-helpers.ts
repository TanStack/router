/**
 * The mock import protection serves in place of a denied module, told by
 * what it does, not by what it looks like (SPEC J6.8, §5 item 18): a safe
 * mock is a value a consumer can read members of, call and construct, to any
 * depth, without an exception, whose primitive conversions do not throw and
 * carry no secret of the denied module. Its label, Proxy shape and where its
 * runtime lives are the compiler's.
 *
 * `probeMock` exercises those operations on a value and reports each
 * outcome; `safeMock` is the outcome of a safe mock, `isSafeMock` and
 * `expectSafeMock` compare with it. A real value fails the probe: a function
 * or an object has no member two levels deep, a primitive none at all.
 * `probeMockPrelude` defines the same probe in the scripts the build and
 * Rsbuild harnesses run in another process, a VM context or a browser page
 * (a mock cannot cross that boundary). Never `await` a mock: the mock runtime is a
 * thenable that resolves to itself.
 *
 * Pure: only the probe and the readers of the runtime diagnostics, no module
 * of the implementation.
 */
import { expect } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import type {
  Diagnostic,
  Severity,
} from '@tanstack/compiler-test-utils/diagnostics'

/**
 * What each operation a consumer may perform on a mock did: `ok`, or the
 * error it threw (`threw: ...`).
 */
export interface MockProbe {
  /** `value.member` */
  read: string
  /** `value.member.deeper.deepest` */
  deepRead: string
  /** `value()` */
  call: string
  /** `value.member()`, `value()()`, `value().member` */
  deepCall: string
  /** `new value()`, `new value.member()` */
  construct: string
  /** `String(value)`, `${value}`, `value + ''`, `Number(value)` */
  primitive: string
  /** `JSON.stringify(value)` */
  json: string
  /** The `secret` text appeared in a primitive conversion of a value. */
  leaked: boolean
}

/**
 * Exercises `value` the way a consumer of a mocked import may (member reads
 * and calls to a depth of three, construction, primitive conversions) and
 * reports each outcome. A primitive conversion whose text contains `secret`
 * counts as a leak. Self-contained (no closure), so that scripts run in
 * another process can define it too (`probeMockPrelude`).
 */
export function probeMock(value: unknown, secret?: string): MockProbe {
  const attempt = (run: () => unknown): string => {
    try {
      run()
      return 'ok'
    } catch (error) {
      return `threw: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  let leaked = false
  const texts = (subject: unknown) => {
    const results = [
      String(subject),
      `${subject}`,
      (subject as string) + '',
      String(Number(subject)),
      String(JSON.stringify(subject)),
    ]
    if (secret !== undefined && results.some((text) => text.includes(secret))) {
      leaked = true
    }
  }
  const any = value as any
  const probe: MockProbe = {
    read: attempt(() => any.member),
    deepRead: attempt(() => any.member.deeper.deepest),
    call: attempt(() => any()),
    deepCall: attempt(() => {
      any.member()
      any()()
      any().member
      any.member.deeper()
      // (Not `any.constructor.member()` or `any.__proto__.member()`: those
      // are the object protocol every value has, not members a consumer
      // reads of the denied binding; a mock may keep them, SPEC §5.18
      // leaves its Proxy shape free.)
    }),
    construct: attempt(() => {
      new any()
      new any.member()
    }),
    primitive: attempt(() => {
      texts(any)
      texts(any.member)
      texts(any())
      texts(new any())
    }),
    json: attempt(() => JSON.stringify(any)),
    leaked,
  }
  probe.leaked = leaked
  return probe
}

/** The outcome of a safe mock: every operation `ok`, nothing leaked. */
export const safeMock: MockProbe = {
  read: 'ok',
  deepRead: 'ok',
  call: 'ok',
  deepCall: 'ok',
  construct: 'ok',
  primitive: 'ok',
  json: 'ok',
  leaked: false,
}

/** Whether `value` is a safe mock (`probeMock(value, secret)` is `safeMock`). */
export function isSafeMock(value: unknown, secret?: string): boolean {
  const probe = probeMock(value, secret)
  return (
    !probe.leaked &&
    Object.keys(probe).every(
      (key) => key === 'leaked' || probe[key as keyof MockProbe] === 'ok',
    )
  )
}

/** Fails, listing the operations that threw or leaked, unless `value` is a safe mock. */
export function expectSafeMock(value: unknown, secret?: string): void {
  expect(probeMock(value, secret)).toEqual(safeMock)
}

/**
 * Defines `probeMock` and `isSafeMock` in a script run elsewhere (the body
 * of a build's `run()` script, an Rsbuild client script): the same probe,
 * serialised. A script reports `isSafeMock(value, 'MARK_SECRET')` or the
 * probe itself; it cannot return the mock.
 */
export const probeMockPrelude = `const probeMock = ${probeMock.toString()}
const isSafeMock = ${isSafeMock.toString()}
`

/**
 * A value's description for a script's result: `a safe mock` for a safe
 * mock, else its text (`describeValue` in `probeMockPrelude` scripts does the
 * same).
 */
export function describeValue(value: unknown, secret?: string): string {
  return isSafeMock(value, secret) ? 'a safe mock' : String(value)
}

/** `describeValue` for `probeMockPrelude` scripts. */
export const describeValuePrelude = `${probeMockPrelude}const describeValue = ${describeValue.toString()}
`

/**
 * What identifies the runtime diagnostic of a use of a mock: its severity
 * and, for a denied file, the file (ruling 2026-10-22: diagnostics are
 * checked by file and position only; a use of the mock of a denied
 * specifier names no file of the app). Which importer used the mock is not
 * required: the violation names it, SPEC J6.5.
 */
export interface MockAccessExpectation {
  /** The console severity (`mockAccess: 'error'` or `'warn'`). */
  severity: Severity
  /** The denied import as the importer wrote it (for the failure message). */
  specifier: string
  /** The file the denied import resolves to, when it is a file. */
  file?: string
  /** The project root `file` is relative to. */
  root?: string
}

/**
 * The runtime diagnostics of a use of a mock (SPEC J6.3, `mockAccess`)
 * among `diagnostics` (what the console received while the app ran): those
 * of the expected severity, naming `file` when one is expected.
 */
export function mockAccessDiagnostics(
  diagnostics: Array<Diagnostic>,
  expected: MockAccessExpectation,
): Array<Diagnostic> {
  const { severity, file, root } = expected
  return findDiagnostics(diagnostics, { severity, file, root })
}

/**
 * Fails, listing what the console received, unless a runtime diagnostic of
 * a use of a mock meets `expected` (`mockAccessDiagnostics`).
 */
export function expectMockAccess(
  diagnostics: Array<Diagnostic>,
  expected: MockAccessExpectation,
): void {
  expect(
    mockAccessDiagnostics(diagnostics, expected).length,
    `a ${expected.severity} naming ${expected.file ?? expected.specifier}, among:\n${diagnostics
      .map(({ severity, text }) => `[${severity}] ${text}`)
      .join('\n')}`,
  ).toBeGreaterThan(0)
}

/**
 * The console diagnostics of warning or error severity: what `mockAccess`
 * may log (`off` logs none of them).
 */
export const warningsAndErrors = (diagnostics: Array<Diagnostic>) =>
  diagnostics.filter(({ severity }) => severity !== 'info')
