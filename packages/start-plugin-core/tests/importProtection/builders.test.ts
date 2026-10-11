import { b } from 'yuku-ast'
import { generateModule } from '@tanstack/router-utils'
import { describe, expect, test } from 'vitest'
import {
  constDeclaration,
  exportList,
  memberAccess,
  mockImport,
  reexportSpecifier,
} from '../../src/import-protection/rewrite'
import type { Node } from '@yuku-toolchain/types'

// The rewrite builds these nodes directly; print them to read the code they stand for.
const print = (node: Node) => generateModule(node).code

describe('import protection builders', () => {
  test('mockImport', () => {
    expect(
      print(
        mockImport('__tss_deny_0', 'tanstack-start-import-protection:mock'),
      ),
    ).toMatchInlineSnapshot(
      `"import __tss_deny_0 from "tanstack-start-import-protection:mock";"`,
    )
  })

  test('memberAccess', () => {
    expect(print(memberAccess('__tss_deny_0', 'secret'))).toMatchInlineSnapshot(
      `"__tss_deny_0.secret"`,
    )
    expect(
      print(memberAccess('__tss_deny_0', 'not-an-identifier')),
    ).toMatchInlineSnapshot(`"__tss_deny_0["not-an-identifier"]"`)
  })

  test('constDeclaration', () => {
    expect(
      print(constDeclaration('secret', memberAccess('__tss_deny_0', 'secret'))),
    ).toMatchInlineSnapshot(`"const secret = __tss_deny_0.secret;"`)
    expect(
      print(constDeclaration('secret', b.Identifier({ name: '__tss_deny_0' }))),
    ).toMatchInlineSnapshot(`"const secret = __tss_deny_0;"`)
  })

  test('exportList', () => {
    expect(
      print(
        exportList([
          reexportSpecifier('__tss_reexport_secret', 'secret'),
          reexportSpecifier('__tss_reexport_0', 'not-an-identifier'),
        ]),
      ),
    ).toMatchInlineSnapshot(
      `"export { __tss_reexport_secret as secret, __tss_reexport_0 as "not-an-identifier" };"`,
    )
  })
})
