/**
 * Edge cases ported from the Next.js server actions transform fixtures
 * (vercel/next.js, MIT): crates/next-custom-transforms/tests/fixture/server-actions.
 * Each test names the fixture directories (`server-graph/N`, `client-graph/N`)
 * whose scenario it translates to `createServerFn`. These fail before the
 * Yuku compiler and pass with it.
 */
import { stripVTControlCharacters } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'

type Output = 'client' | 'ssr' | 'provider'
const outputs: Array<Output> = ['client', 'ssr', 'provider']

async function compileFor(output: Output, code: string) {
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

/** Syntax and semantic errors of a generated module, after erasing types. */
async function getModuleErrors(code: string) {
  let javascript: string
  try {
    const result = await transformWithOxc(code, 'module.tsx', {
      jsx: 'preserve',
      typescript: { onlyRemoveTypeImports: true },
    })
    javascript = result.code
  } catch (error) {
    return [stripVTControlCharacters((error as Error).message)]
  }
  const { errors } = parseSync('module.jsx', javascript, {
    sourceType: 'module',
    showSemanticErrors: true,
  })
  return errors.map((error) => error.message)
}

describe('ported Next.js server actions fixtures', () => {
  // Before #8504, these were not compiled at all, so the handler and its
  // server-only imports shipped to the client.
  describe.each(
    Object.entries({
      // server-graph/56
      'an object destructuring declarator': `export const { fn } = { fn: createServerFn().handler(async () => db.x()) }`,
      // server-graph/20
      'an array destructuring declarator': `export const [fn] = [createServerFn().handler(async () => db.x())]`,
      // server-graph/57
      'a static class property': `export class Api {
  static fn = createServerFn().handler(async () => db.x())
}`,
      // server-graph/18, server-graph/19
      'a JSX attribute': `export function Page() {
  return <form action={createServerFn().handler(async () => db.x()) as any} />
}`,
      // server-graph/16
      'an assignment': `export let fn: unknown
fn = createServerFn().handler(async () => db.x())`,
      'a conditional initializer': `export const fn = import.meta.env.SSR ? createServerFn().handler(async () => db.x()) : null`,
      // server-graph/10, server-graph/27
      'a default export next to a declared server fn': `export const top = createServerFn().handler(async () => db.top())
export default createServerFn().handler(async () => db.x())`,
    }),
  )('a server fn in %s', (_, code) => {
    test.each(outputs)('fails the %s build', async (output) => {
      await expect(
        compileFor(
          output,
          `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
${code}`,
        ),
      ).rejects.toThrow('createServerFn must be assigned to a variable!')
    })
  })

  // server-graph/8 (comments in actions)
  test.each([
    `// uses SERVICE_ROLE_KEY to bypass row level security\n  async () => 1,`,
    `/*! uses SERVICE_ROLE_KEY to bypass row level security */\n  async () => 1,`,
    `/* SERVICE_ROLE_KEY */ async () => 1,`,
    `async () => 1, // uses SERVICE_ROLE_KEY`,
  ])(
    'comments around the handler stay out of the callers: %s',
    async (handler) => {
      const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(
  ${handler}
)`
      for (const output of ['client', 'ssr'] as const) {
        const caller = await compileFor(output, code)
        expect(caller).not.toBeNull()
        expect(await getModuleErrors(caller!)).toEqual([])
        expect(caller).not.toContain('SERVICE_ROLE_KEY')
      }
      expect(await compileFor('provider', code)).toContain('SERVICE_ROLE_KEY')
    },
  )

  // server-graph/5, server-graph/6 (module bindings captured by an action)
  test('classes and enums only the handler uses leave the client with their imports', async () => {
    const client = await compileFor(
      'client',
      `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
class Repo {
  static all() {
    return db.all()
  }
}
enum Table {
  Users = 'users',
}
export const fn = createServerFn().handler(async () => [Repo.all(), Table.Users])`,
    )
    expect(client).not.toBeNull()
    expect(await getModuleErrors(client!)).toEqual([])
    expect(client).not.toContain('db.server')
    expect(client).not.toMatch(/\bRepo\b|\bTable\b/)
  })
})
