/**
 * Waku `allowServer` transform edge cases (wakujs/waku, MIT:
 * packages/waku/tests/vite-plugin-allow-server.test.ts) that the Babel
 * compiler on main gets wrong and the Yuku compiler gets right.
 */
import { expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'

async function compile(output: 'client' | 'ssr' | 'provider', code: string) {
  const env = output === 'client' ? 'client' : 'server'
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
    resolveId: async (id) => (id.startsWith('@tanstack/') ? id : null),
  })
  const id = '/test/src/module.tsx'
  const result = await compiler.compile({
    code,
    id: output === 'provider' ? `${id}?tss-serverfn-split` : id,
    detectedKinds: detectKindsInCode(code, env),
  })
  return result?.code ?? null
}

// "does not require allowServer to come from waku/client" (inverted: Start
// compiles a factory call only when the callee is the Start import). Main
// resolves calls by name, ignoring scopes: a parameter or local named like a
// Start factory is compiled as one. The function a caller passes in is then
// replaced by a throwing stub, a middleware loses `.server()`, and a
// shadowed `createServerFn` registers a server fn whose provider export is
// never declared.
test('parameters and locals shadowing the Start factories are left alone', async () => {
  const code = `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
export const real = createServerOnlyFn(() => 'real')
export function wrap(createServerOnlyFn: (fn: () => string) => () => string) {
  return createServerOnlyFn(() => 'param')
}
export function local() {
  const createClientOnlyFn = (fn: () => string) => fn
  return createClientOnlyFn(() => 'local')
}
export function iso(createIsomorphicFn: () => any) {
  return createIsomorphicFn().server(() => 's').client(() => 'c')
}
export function mw(createMiddleware: () => any) {
  return createMiddleware().server(() => 's')
}
export function make(createServerFn: () => any) {
  const made = createServerFn().handler(() => 'param')
  return made
}`
  for (const output of ['client', 'ssr', 'provider'] as const) {
    const compiled = await compile(output, code)
    expect(compiled, output).not.toBeNull()
    expect(compiled, output).toContain(
      `return createServerOnlyFn(() => 'param')`,
    )
    expect(compiled, output).toContain(
      `return createClientOnlyFn(() => 'local')`,
    )
    expect(compiled, output).toMatch(
      /return createIsomorphicFn\(\)\.server\(\(\) => 's'\)\.client\(\(\) => 'c'\)/,
    )
    expect(compiled, output).toMatch(
      /return createMiddleware\(\)\.server\(\(\) => 's'\)/,
    )
    expect(compiled, output).toMatch(
      /createServerFn\(\)\.handler\(\(\) => 'param'\)/,
    )
    expect(compiled, output).not.toMatch(/made_createServerFn_handler|Rpc\(/)
  }
})
