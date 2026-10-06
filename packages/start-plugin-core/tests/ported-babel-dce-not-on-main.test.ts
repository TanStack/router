/**
 * Scenarios ported from babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * MIT) that main's Start compiler gets wrong and the Yuku compiler gets right.
 */
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { getModuleErrors } from './validate-module'

async function compileStartModule(options: {
  env: 'client' | 'server'
  code: string
  provider?: boolean
}) {
  const { env } = options
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
  const result = await compiler.compile({
    code: options.code,
    id: `/test/src/module.tsx${options.provider ? '?tss-serverfn-split' : ''}`,
    detectedKinds: detectKindsInCode(options.code, env),
  })
  return result?.code ?? null
}

const head = `import { createServerFn } from '@tanstack/react-start'\n`

describe('ported babel-dead-code-elimination: fixed by the Yuku compiler', () => {
  // Source: dead-code-elimination.test.ts "function" > "declaration",
  // "variable" > "identifier" and "repeated elimination". Main only prunes
  // imports, variable declarators and function declarations, so classes,
  // TypeScript overloads, enums, namespaces and redeclared vars that only a
  // handler uses stay on the client together with their server-only imports
  // and initializers (`static instance = new Repo()` runs in the browser).
  test.each([
    {
      name: 'a class',
      declarations: `class Repo extends db.Base {
  static instance = new Repo()
  find() { return 'found' }
}`,
      use: 'Repo.instance.find()',
    },
    {
      name: 'an overloaded function',
      declarations: `function Repo(id: string): string
function Repo(id: number): string
function Repo(id: any) { return db.x(id) }`,
      use: 'Repo(1)',
    },
    {
      name: 'an enum and a namespace',
      declarations: `enum Role { Admin = 'admin' }
namespace Repo {
  export const conn = db.connect()
}`,
      use: '[Role.Admin, Repo.conn]',
    },
    {
      name: 'a redeclared var',
      declarations: `var Repo = db.a()
var Repo = db.b()`,
      use: 'Repo',
    },
  ])(
    'the client drops $name only a handler uses',
    async ({ declarations, use }) => {
      const code = `${head}import { db } from './db.server'
${declarations}
export const fn = createServerFn().handler(async () => ${use})
`
      const client = await compileStartModule({ env: 'client', code })
      expect(await getModuleErrors(client!)).toEqual([])
      expect(client).not.toContain('./db.server')
      expect(client).not.toMatch(/\bRepo\b/)
      const provider = await compileStartModule({
        env: 'server',
        provider: true,
        code,
      })
      expect(await getModuleErrors(provider!)).toEqual([])
      expect(provider).toMatch(/\b(?:class|function|var|namespace) Repo\b/)
    },
  )

  // Source: dead-code-elimination.test.ts "object pattern" > "unzips if all
  // variables are unused" and "array pattern" > "unzips if all variables are
  // unused". Main deletes every declaration with an empty pattern, together
  // with its initializer, although nothing was removed from it.
  test.each(['client', 'provider'] as const)(
    '%s: keeps the initializers of empty destructuring patterns',
    async (output) => {
      const result = await compileStartModule({
        env: output === 'client' ? 'client' : 'server',
        provider: output === 'provider',
        code: `${head}import { init, other } from './init'
const {} = init()
const [] = other()
const { a: {} } = init()
export const fn = createServerFn().handler(async () => 'ok')
`,
      })
      expect(await getModuleErrors(result!)).toEqual([])
      expect(result!.match(/\binit\(\)/g)).toHaveLength(2)
      expect(result).toContain('other()')
    },
  )
})
