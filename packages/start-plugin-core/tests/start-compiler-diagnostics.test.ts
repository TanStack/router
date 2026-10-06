import { expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'

async function collectWarnings(code: string) {
  const warnings: Array<string> = []
  const compiler = new StartCompiler({
    env: 'client',
    envName: 'client',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv('client'),
    lookupConfigurations: getLookupConfigurationsForEnv('client', 'react'),
    getKnownServerFns: () => ({}),
    loadModule: async () => {},
    resolveId: async (id) => id,
    warn: (message) => warnings.push(message),
  })
  await compiler.compile({
    code,
    id: '/test/src/module.tsx',
    detectedKinds: detectKindsInCode(code, 'client'),
  })
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
