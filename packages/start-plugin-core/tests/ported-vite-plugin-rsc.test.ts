/**
 * Known bugs found by porting the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT). Each
 * test names the plugin-rsc test or fixture it is ported from.
 */
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'

async function compile(env: 'client' | 'server', code: string, id: string) {
  const compiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
    getKnownServerFns: () => ({}),
    loadModule: async () => {},
    resolveId: async (source) =>
      source.startsWith('@tanstack/') ? source : null,
  })
  const result = await compiler.compile({
    code,
    id,
    detectedKinds: detectKindsInCode(code, env),
  })
  return result?.code ?? null
}

describe('known Start compiler bugs (ported from @vitejs/plugin-rsc)', () => {
  // cjs.test.ts (fixtures/cjs: CommonJS modules are sloppy-mode scripts)
  // Bug: every `.js`/`.cjs` file whose text matches a detection pattern (for
  // example `.handler(`) is parsed as a strict ES module, including CommonJS
  // dependencies that client builds bundle. Sloppy-mode syntax such as a
  // legacy octal escape, a `with` statement or a top-level `return` throws a
  // SyntaxError although the file has no Start import to compile. Impact: a
  // CommonJS dependency containing such code and text like `app.handler(`
  // fails the build. Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a legacy octal escape',
      id: '/test/node_modules/lib/index.cjs',
      code: `var reset = '\\033[0m'
module.exports = function (app) {
  return app.handler(reset)
}`,
    },
    {
      name: 'a with statement',
      id: '/test/node_modules/lib/index.cjs',
      code: `with (Math) {
  exports.run = function (app) {
    return app.handler(PI)
  }
}`,
    },
    {
      name: 'a top-level return',
      id: '/test/node_modules/lib/index.js',
      code: `if (typeof window === 'undefined') return
exports.run = function (app) {
  return app.handler(1)
}`,
    },
  ])(
    'a CommonJS dependency with $name is left untouched',
    async ({ id, code }) => {
      for (const env of ['client', 'server'] as const) {
        await expect(compile(env, code, id)).resolves.toBeNull()
      }
    },
  )
})
