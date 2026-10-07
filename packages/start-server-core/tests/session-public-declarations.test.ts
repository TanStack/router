// @vitest-environment node

import { URL as NodeURL, fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { expect, test } from 'vitest'

test('published session declarations preserve their algorithm contracts', () => {
  const fixture = fileURLToPath(
    new NodeURL('./fixtures/session-public-types.ts', import.meta.url),
  )
  const program = ts.createProgram([fixture], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    types: ['node'],
  })
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
  expect(diagnostics).toEqual([])
})
