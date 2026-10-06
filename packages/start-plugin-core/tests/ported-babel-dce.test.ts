/**
 * Scenarios ported from babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * `src/find-referenced-identifiers.test.ts` and
 * `src/find-removable-bindings.test.ts`, MIT). The Start compiler removes
 * server function handlers (and the other environment's implementations) and
 * then everything only they used; these tests check which bindings that
 * removal prunes and which it keeps.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { declarationOf, getModuleErrors } from './validate-module'

type Output = 'client' | 'ssr' | 'provider'

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
  expect(result, output).not.toBeNull()
  return result!.code
}

/** Compiles the client, SSR caller and provider outputs and validates each. */
async function compileAll(code: string) {
  const compiled = {} as Record<Output, string>
  const errors = {} as Record<Output, Array<string>>
  for (const output of ['client', 'ssr', 'provider'] as const) {
    compiled[output] = await compileFor(output, code)
    errors[output] = await getModuleErrors(compiled[output])
  }
  expect(errors).toEqual({ client: [], ssr: [], provider: [] })
  return compiled
}

/** Matches the source of an import or re-export statement. */
const moduleSource =
  /^(\s*import\s*|\s*(?:import|export)\b[^;'"]*?\bfrom\s*)(["'])([^"']+)\2/gm

const dataUrl = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`

const startRuntime: Record<string, string> = {
  '@tanstack/react-start': `
const builder = () => {
  const self = { handler: (rpc) => ({ rpc }) }
  return self
}
export const createServerFn = builder`,
  '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ client: id })`,
}

/** Evaluates a compiled module, resolving every import to the given stubs. */
async function importModule(
  code: string,
  modules: Record<string, string>,
): Promise<Record<string, any>> {
  const sources = { ...startRuntime, ...modules }
  const { code: javascript } = await transformWithOxc(code, 'module.ts')
  const linked = javascript.replace(
    moduleSource,
    (_match, prefix: string, _quote: string, source: string) => {
      const stub = sources[source]
      if (stub === undefined) {
        throw new Error(`No stub for import ${source}`)
      }
      return `${prefix}${JSON.stringify(dataUrl(stub))}`
    },
  )
  return import(/* @vite-ignore */ dataUrl(linked))
}

const head = `import { createServerFn } from '@tanstack/react-start'\n`

describe('ported babel-dead-code-elimination: imports', () => {
  // Source: dead-code-elimination.test.ts "import" > "mixed default and named:
  // only named used" and "mixed default and named: only default used"
  test('each output keeps only the specifiers of a mixed import it reads', async () => {
    const compiled = await compileAll(`${head}import db, { query } from './db'
export const fn = createServerFn().handler(async () => query())
export const name = db.name
`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).toMatch(/^import db from ['"]\.\/db['"]/m)
      expect(caller).not.toContain('query')
    }
    expect(compiled.provider).toMatch(
      /^import \{ query \} from ['"]\.\/db['"]/m,
    )
    expect(compiled.provider).not.toMatch(/import db\b/)
  })
})

describe('ported babel-dead-code-elimination: declarations', () => {
  // Source: dead-code-elimination.test.ts "SCC dead code elimination" >
  // "mutual recursion without external refs -> removed", "self-recursive
  // function unused -> removed", "unexported circular references" and
  // find-removable-bindings.test.ts "mutual recursion without external refs ->
  // removable"
  test('callers drop handler-only cycles and default parameters but keep cycles nothing used', async () => {
    const compiled =
      await compileAll(`${head}import { secret, defaultId } from './secret.server'
function walk(n: number): number { return n > 0 ? walkBack(n - 1) : secret.length }
function walkBack(n: number): number { return n > 0 ? walk(n - 1) : 0 }
const loop = (n: number): number => (n > 0 ? loop(n - 1) : 0)
function load(id = defaultId()) { return id }
function unusedA(): number { return unusedB() }
function unusedB(): number { return unusedA() }
export const fn = createServerFn().handler(async () => [walk(3), loop(2), load()])
`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).not.toContain('./secret.server')
      for (const name of ['walk', 'walkBack', 'loop', 'load']) {
        expect(caller).not.toMatch(declarationOf(name))
      }
    }
    for (const name of ['walk', 'walkBack', 'loop', 'load']) {
      expect(compiled.provider).toMatch(declarationOf(name))
    }
    for (const output of [compiled.client, compiled.ssr, compiled.provider]) {
      expect(output).toMatch(declarationOf('unusedA'))
      expect(output).toMatch(declarationOf('unusedB'))
    }
  })

  // Source: dead-code-elimination.test.ts "assignment" and
  // find-removable-bindings.test.ts "constant violations mark as external"
  test('callers keep handler-read bindings that top-level statements assign', async () => {
    const compiled = await compileAll(`${head}let x: number
x = 2
y = 3
var y: number
export const fn = createServerFn().handler(async () => [x, y])
`)
    for (const output of [compiled.client, compiled.ssr, compiled.provider]) {
      expect(output).toMatch(declarationOf('x'))
      expect(output).toMatch(/^x = 2;/m)
      expect(output).toMatch(declarationOf('y'))
      expect(output).toMatch(/^y = 3;/m)
    }
  })

  // Source: dead-code-elimination.test.ts "repeated elimination"
  test('callers drop a binding only the handler writes and keep a declarator a kept sibling reads', async () => {
    const compiled =
      await compileAll(`${head}import { serverValue } from './db.server'
let hits = 0
let a = serverValue(), b = a
export const fn = createServerFn().handler(async () => {
  hits++
  return a
})
export const clientB = b
`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).not.toMatch(declarationOf('hits'))
      expect(caller).toMatch(/let a = serverValue\(\),\s*b = a/)
    }
    expect(compiled.provider).toMatch(declarationOf('hits'))
    expect(compiled.provider).not.toMatch(declarationOf('b'))
  })
})

describe('ported babel-dead-code-elimination: patterns', () => {
  // Source: dead-code-elimination.test.ts "object pattern" > "preserves unused
  // variables when rest is used", "array pattern" > "within variable
  // declarator" and "within assignment pattern"
  test('callers keep what destructurings with rests, holes and defaults bind', async () => {
    const compiled = await compileAll(`${head}import { env } from './env'
const { secret, ...publicEnv } = env
const [serverOnly, second, ...rest] = env.list
const { a: [{ aa, bb }] = [{ aa: 0, bb: 0 }], c: { cc, ...cRest } = {} as any } = env.nested
export const fn = createServerFn().handler(async () => [secret, serverOnly, aa, cc])
export const values = [Object.keys(publicEnv), second, rest, bb, cRest]
`)
    const client = await importModule(compiled.client, {
      './env': `export const env = {
  secret: 's', host: 'h', port: 1,
  list: ['server', 'second', 'third', 'fourth'],
  nested: { a: [{ aa: 'aa', bb: 'bb' }], c: { cc: 'cc', dd: 'dd' } },
}`,
    })
    expect(client.values).toEqual([
      ['host', 'port', 'list', 'nested'],
      'second',
      ['third', 'fourth'],
      'bb',
      { dd: 'dd' },
    ])
  })
})

describe('ported babel-dead-code-elimination: var declarations nested in statements', () => {
  // Source: dead-code-elimination.test.ts "variable" > "within for...in" and
  // "within for...of" (var bindings declared inside nested statements). Main
  // removes handler-only var declarators wherever they are nested, so their
  // server-only initializers never reach the callers.
  test('callers drop handler-only vars declared inside top-level statements', async () => {
    const compiled =
      await compileAll(`${head}import { serverOnly, connect, a, b, c } from './db.server'
if (typeof window === 'undefined') {
  var flag = serverOnly()
}
try {
  var conn = connect()
} catch {}
switch (process.env.MODE) {
  case 'x':
    var mode = a()
}
outer: {
  var labeled = b()
  break outer
}
for (var i = 0, pool = c(); i < 1; i++) {}
export const fn = createServerFn().handler(async () => [flag, conn, mode, labeled, pool])
`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).not.toContain('./db.server')
      for (const call of ['serverOnly()', 'connect()', 'a()', 'b()', 'c()']) {
        expect(caller).not.toContain(call)
      }
    }
    expect(compiled.provider).toContain('var flag = serverOnly()')
    expect(compiled.provider).toContain('var conn = connect()')
  })

  // Source: dead-code-elimination.test.ts "variable" > "within for...in"
  test('the client drops a var nested in a function block that only the server implementation reads', async () => {
    const client = await compileFor(
      'client',
      `import { createIsomorphicFn } from '@tanstack/react-start'
import { serverCall } from './db.server'
export function getValue(flag: boolean) {
  if (flag) {
    var local = serverCall()
  }
  const read = createIsomorphicFn().server(() => local).client(() => 'client')
  return read()
}
`,
    )
    expect(await getModuleErrors(client)).toEqual([])
    expect(client).not.toContain('./db.server')
    expect(client).not.toContain('serverCall()')
  })
})
