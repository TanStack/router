import { expect, test } from 'vitest'
import { createStartCompiler } from './regression-helpers'

async function collectWarnings(code: string) {
  const warnings: Array<string> = []
  const { compile } = createStartCompiler({
    env: 'client',
    warn: (message) => warnings.push(message),
  })
  await compile(code)
  return warnings
}

// Line terminators are \n, \r\n, a lone \r, U+2028 and U+2029. Editors report
// locations against all of them, so diagnostics must count every one.
test.each([
  ['\\n', '\n'],
  ['\\r\\n', '\r\n'],
  ['a lone \\r', '\r'],
])(
  'reports the deprecated inputValidator location with %s line endings',
  async (_name, eol) => {
    const code = [
      `import { createServerFn } from '@tanstack/react-start'`,
      `const a = 1`,
      `const b = 2`,
      `export const fn = createServerFn().inputValidator((x: string) => x).handler(async () => a + b)`,
    ].join(eol)
    expect(await collectWarnings(code)).toEqual([
      '/test/src/module.tsx:4:19 createServerFn().inputValidator() is deprecated. Use createServerFn().validator() instead.',
    ])
  },
)
