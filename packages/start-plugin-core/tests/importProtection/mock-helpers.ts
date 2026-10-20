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
 * The rest evaluates the mock modules import protection generates, through
 * the same pipeline the plugins use (the names an importer uses from a
 * denied source → a mock-edge module importing the mock runtime, or the
 * self-contained mock of a denied file), linked as real ES modules
 * (`@tanstack/compiler-test-utils/module-linker`), so that tests assert what
 * an importer gets, not the generated code.
 */
import { expect } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import {
  getMockExportNamesBySource,
  getNamedExports,
} from '../../src/import-protection/analysis'
import { MOCK_MODULE_ID } from '../../src/import-protection/constants'
import {
  generateDevSelfDenialModule,
  generateSelfContainedMockModule,
  makeMockEdgeModuleId,
} from '../../src/import-protection/virtualModules'
import {
  loadResolvedVirtualModule,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
import type {
  Diagnostic,
  Severity,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'

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
      any.constructor.member()
      any.__proto__.member()
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
 * and the denied import. (Which importer used the mock is not required: the
 * violation report names it, SPEC J6.5; main's mock of a denied file names
 * the denied file in its place.)
 */
export interface MockAccessExpectation {
  /** The console severity (`mockAccess: 'error'` or `'warn'`). */
  severity: Severity
  /** The denied import as the importer wrote it. */
  specifier: string
  /** The file the denied import resolves to, when it is a file. */
  file?: string
  /** The project root `file` is relative to. */
  root?: string
}

/**
 * The runtime diagnostics of a use of a mock (SPEC J6.3, `mockAccess`)
 * among `diagnostics` (what the console received while the app ran, read
 * by the shared A9 oracle `@tanstack/compiler-test-utils/diagnostics`):
 * those of the expected severity that name the denied import, as written
 * (`specifier`, a whole name) or as the file it resolves to (`file`). The
 * prose and whether a file is spelled absolute or relative are free (SPEC
 * §5.7, J6.12).
 */
export function mockAccessDiagnostics(
  diagnostics: Array<Diagnostic>,
  expected: MockAccessExpectation,
): Array<Diagnostic> {
  const { severity, specifier, file, root } = expected
  return findDiagnostics(diagnostics, { severity }).filter(
    (diagnostic) =>
      findDiagnostics(diagnostic, { names: [specifier] }).length > 0 ||
      (file !== undefined &&
        findDiagnostics(diagnostic, { file, root }).length > 0),
  )
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

/**
 * Evaluates `importer` with each denied import `source` (one specifier or
 * several) replaced by the mock edge import protection serves for it: a
 * module exporting a mock for each name the importer uses from that source
 * (and a default export), all members of the mock runtime `runtimeId`
 * (default: the silent mock). Other imports link to `stubs` (by specifier) or
 * fail to link. Returns the importer's namespace.
 */
export async function evaluateWithMock(
  importer: string,
  source: string | Array<string>,
  options: {
    /** Id the importer is analysed and evaluated under. */
    id?: string
    stubs?: Record<string, ModuleStub>
    runtimeId?: string
  } = {},
): Promise<Record<string, any>> {
  const id = options.id ?? '/test/src/importer.ts'
  const namesBySource = getMockExportNamesBySource(importer, id)
  const edgeIds = new Map(
    (Array.isArray(source) ? source : [source]).map((denied) => [
      denied,
      mockEdgeId(namesBySource.get(denied) ?? [], options.runtimeId),
    ]),
  )
  const graph = createModuleGraph({
    modules: { [id]: importer },
    stubs: options.stubs,
    resolve: (specifier) =>
      edgeIds.get(specifier) ?? resolveInternalVirtualModuleId(specifier),
    load: (virtualId) => loadResolvedVirtualModule(virtualId)?.code,
  })
  return graph.import(id)
}

/**
 * Evaluates the self-contained mock import protection serves for a denied
 * file in place of the file itself, generated from the names the file
 * exports (`code`, analysed under `id`). Returns the mock's namespace.
 */
export async function selfMock(
  code: string,
  id = '/test/src/denied.server.ts',
): Promise<Record<string, any>> {
  return evaluateMockModule(
    generateSelfContainedMockModule(getNamedExports(code, id)).code,
  )
}

/**
 * Evaluates each kind of mock module import protection generates for the
 * export names `names` and returns its namespace: the self-contained mock of
 * a denied file, the mock edge of a denied import (for an importer using
 * `names`) and the module dev serves in place of a denied file exporting
 * `names`, the last two importing the silent mock runtime.
 */
export const mockModules: Record<
  'self-contained mock' | 'mock edge' | 'dev self-denial module',
  (names: Array<string>) => Promise<Record<string, any>>
> = {
  'self-contained mock': (names) =>
    evaluateMockModule(generateSelfContainedMockModule(names).code),
  'mock edge': (names) =>
    evaluateMockModule(loadResolvedVirtualModule(mockEdgeId(names))!.code),
  'dev self-denial module': (names) =>
    evaluateMockModule(generateDevSelfDenialModule(names, MOCK_MODULE_ID).code),
}

/** Resolved id of the mock edge exporting `names` as members of `runtimeId`. */
function mockEdgeId(names: Array<string>, runtimeId = MOCK_MODULE_ID) {
  return resolveInternalVirtualModuleId(makeMockEdgeModuleId(names, runtimeId))!
}

/**
 * Evaluates a generated mock module as an ES module; what it imports links
 * to the virtual modules import protection serves (the mock runtime).
 */
export function evaluateMockModule(code: string): Promise<Record<string, any>> {
  const mockId = '/test/mock.js'
  return createModuleGraph({
    modules: { [mockId]: code },
    resolve: (specifier) => resolveInternalVirtualModuleId(specifier),
    load: (virtualId) => loadResolvedVirtualModule(virtualId)?.code,
  }).import(mockId)
}
