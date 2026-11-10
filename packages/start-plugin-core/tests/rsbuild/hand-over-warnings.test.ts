/**
 * Rsbuild dev: the warnings of a compilation that a newer one replaced
 * before Rsbuild printed it are reported by the newer one. Rspack reports a
 * module's warnings only in the compilation that built it, and a dev session
 * reports each warning once (LR-10), so a module the newer compilation built
 * again reports none of them itself: its recorded warnings are handed over
 * too (review round 3, R3-G5-3: a double save printed the warning zero
 * times; ruling F1: tested through the session's own logic, no timed dev
 * servers).
 */
import { describe, expect, test } from 'vitest'
import { LOCATED_DIAGNOSTICS } from '../../src/rsbuild/compiler-session'
import { handOverWarnings } from '../../src/rsbuild/host-plugin'
import type { LocatedDiagnostic } from '@tanstack/router-utils/compiler'

const warning = (message: string, line = 1): LocatedDiagnostic => ({
  severity: 'warning',
  message,
  line,
  column: 1,
})

const moduleOf = (resource: string, records: Array<LocatedDiagnostic> = []) => ({
  resource,
  buildInfo: { [LOCATED_DIAGNOSTICS.field]: records },
  identifier: () => resource,
})

const role = '/app/src/role.ts'

describe('warnings handed over to the next compilation', () => {
  test('a module the newer compilation kept: its warnings', () => {
    const kept = moduleOf(role, [warning('MARK_ROLE')])
    const { handed } = handOverWarnings(
      new Map([[role, [warning('MARK_ROLE')]]]),
      [kept],
      () => false,
    )
    expect(handed).toEqual([{ module: kept, warning: warning('MARK_ROLE') }])
  })

  test('a module the newer compilation built again without reporting them: its warnings', () => {
    const rebuilt = moduleOf(role, [])
    const { handed } = handOverWarnings(
      new Map([[role, [warning('MARK_ROLE')]]]),
      [rebuilt],
      (resource) => resource === role,
    )
    expect(handed).toEqual([{ module: rebuilt, warning: warning('MARK_ROLE') }])
  })

  test('a warning the newer compilation reports itself: not twice', () => {
    const rebuilt = moduleOf(role, [warning('MARK_ROLE')])
    const { handed } = handOverWarnings(
      new Map([[role, [warning('MARK_ROLE'), warning('MARK_OTHER', 2)]]]),
      [rebuilt],
      (resource) => resource === role,
    )
    expect(handed).toEqual([
      { module: rebuilt, warning: warning('MARK_OTHER', 2) },
    ])
  })

  test('a module no longer in the newer compilation: nothing', () => {
    const { handed } = handOverWarnings(
      new Map([[role, [warning('MARK_ROLE')]]]),
      [moduleOf('/app/src/other.ts')],
      () => true,
    )
    expect(handed).toEqual([])
  })

  test('what the newer compilation reports, for the one after it: its own warnings and the handed ones', () => {
    const other = '/app/src/other.ts'
    const { reported } = handOverWarnings(
      new Map([[role, [warning('MARK_ROLE')]]]),
      [moduleOf(role, []), moduleOf(other, [warning('MARK_OTHER')])],
      () => true,
    )
    expect(Object.fromEntries(reported)).toEqual({
      [role]: [warning('MARK_ROLE')],
      [other]: [warning('MARK_OTHER')],
    })
  })

  test('the warnings of a module the newer compilation kept without a record of them: not its own', () => {
    const { reported } = handOverWarnings(
      null,
      [moduleOf(role, [warning('MARK_ROLE')])],
      () => false,
    )
    expect(reported.size).toBe(0)
  })
})
