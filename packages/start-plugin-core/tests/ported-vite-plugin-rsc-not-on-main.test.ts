/**
 * Edge cases ported from the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT) that
 * the Babel-based compiler on main miscompiles. Each test names the
 * plugin-rsc fixture it is ported from.
 */
import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { getModuleErrors } from './validate-module'

async function compileClient(code: string) {
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
    resolveId: async (id) => (id.startsWith('@tanstack/') ? id : null),
  })
  const result = await compiler.compile({
    code,
    id: '/test/src/module.tsx',
    detectedKinds: detectKindsInCode(code, 'client'),
  })
  expect(result).not.toBeNull()
  expect(await getModuleErrors(result!.code)).toEqual([])
  return result!.code
}

const dataUrl = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`

const stubs: Record<string, string> = {
  '@tanstack/react-start': `export const createServerFn = () => ({ handler: (rpc) => rpc })`,
  '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ client: id })`,
}

/** Evaluates a compiled client module, resolving imports to the stubs. */
async function importClient(code: string): Promise<Record<string, any>> {
  const { code: javascript } = await transformWithOxc(code, 'module.ts')
  const linked = javascript.replace(
    /\bfrom\s*(["'])([^"']+)\1/g,
    (_match, _quote: string, source: string) => {
      const stub = stubs[source]
      if (stub === undefined) {
        throw new Error(`No stub for import ${source}`)
      }
      return `from ${JSON.stringify(dataUrl(stub))}`
    },
  )
  return import(/* @vite-ignore */ dataUrl(linked))
}

const head = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
`

// Main keeps the server-only import in the client caller when its name is
// reused by an enum member, an overload signature parameter or a parameter
// property. Impact on main: with `verbatimModuleSyntax` the server module is
// imported by the client bundle (or import protection fails the build).
test.each([
  {
    // typescript-eslint/ts-enum/member-ref.js
    name: 'an enum member',
    code: `export enum Flags {
  db = 1,
  other = db + 1,
}`,
    check: (client: Record<string, any>) => expect(client.Flags.other).toBe(2),
  },
  {
    // typescript-eslint/functions/function-declaration/overload.js
    name: 'an overload parameter',
    code: `export function call(db: string): string
export function call(value: string) {
  return value
}`,
    check: (client: Record<string, any>) =>
      expect(client.call('call')).toBe('call'),
  },
  {
    // typescript-eslint/class/declaration/parameter-properties.js
    name: 'a parameter property',
    code: `export class Service {
  constructor(private db: string) {}
  read() {
    return this.db
  }
}`,
    check: (client: Record<string, any>) =>
      expect(new client.Service('param').read()).toBe('param'),
  },
])(
  'the client drops a handler-only import named like $name',
  async ({ code, check }) => {
    const client = await compileClient(`${head}${code}`)
    expect(client).not.toContain('db.server')
    check(await importClient(client))
  },
)

// typescript-eslint/type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js
// Main prints `(count as number)++` as `count as number++`, which does not
// parse. Impact on main: any module the compiler rewrites fails the build.
test('asserted update operands keep their parentheses', async () => {
  const client = await compileClient(`${head}let count = 0
export function bump() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}`)
  expect((await importClient(client)).bump()).toBe(4)
})
