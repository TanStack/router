/**
 * SolidStart directive compiler edge cases (solidjs/solid-start, MIT:
 * packages/start/src/directives) that the Babel compiler on main gets wrong
 * and the Yuku compiler gets right. Each test names the SolidStart test or
 * helper whose scenario it translates.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { getModuleErrors } from './validate-module'
import type { StartCompilerPlugin } from '../src/types'
import type { ServerFn } from '../src/start-compiler/types'

type Output = 'client' | 'ssr' | 'provider'

async function compile(
  output: Output,
  code: string,
  compilerPlugins?: Array<StartCompilerPlugin>,
) {
  const env = output === 'client' ? 'client' : 'server'
  const serverFns: Record<string, ServerFn> = {}
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
    onServerFnsById: (fns) => Object.assign(serverFns, fns),
    loadModule: async () => {},
    resolveId: async (id) => (id.startsWith('@tanstack/') ? id : null),
    compilerPlugins,
  })
  const id = '/test/src/module.tsx'
  const result = await compiler.compile({
    code,
    id: output === 'provider' ? `${id}?tss-serverfn-split` : id,
    detectedKinds: detectKindsInCode(code, env),
  })
  return { code: result?.code ?? null, serverFns }
}

const moduleSource =
  /^(\s*import\s*|\s*(?:import|export)\b[^;'"]*?\bfrom\s*)(["'])([^"']+)\2/gm

function importSources(code: string) {
  return [...code.matchAll(moduleSource)]
    .map((match) => match[3]!)
    .filter((source) => !source.startsWith('@tanstack/'))
    .sort()
}

const dataUrl = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`

const runtime: Record<string, string> = {
  '@tanstack/react-start': `
const uncompiled = () => { throw new Error('uncompiled Start factory') }
export const createServerFn = () => ({
  handler: (rpc, impl) => (impl ? { __executeServer: (opts) => impl(opts) } : { rpc }),
})
export const createServerOnlyFn = uncompiled
export const createClientOnlyFn = uncompiled
export const createIsomorphicFn = uncompiled`,
  '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
}

async function importModule(
  code: string,
  modules: Record<string, string> = {},
): Promise<Record<string, any>> {
  const sources = { ...runtime, ...modules }
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

describe('ported SolidStart directives', () => {
  // plugin.ts transformFunction (directive functions nested in a server
  // function are compiled too). Main leaves env-specific functions inside a
  // handler untransformed in the provider: the client-only implementation
  // and its browser-only import ship in the server bundle.
  test('env-specific functions inside a handler are compiled in the provider', async () => {
    const { code } = await compile(
      'provider',
      `import { createServerFn, createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
import { chart } from './chart.client'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => {
  const draw = createClientOnlyFn(() => chart())
  const now = createIsomorphicFn().server(() => db.now()).client(() => chart())
  const read = createServerOnlyFn(() => db.read())
  let drawn
  try {
    drawn = draw()
  } catch (error) {
    drawn = (error as Error).message
  }
  return [drawn, now(), read()]
})`,
    )
    expect(await getModuleErrors(code!)).toEqual([])
    expect(importSources(code!)).toEqual(['./db.server'])
    const module = await importModule(code!, {
      './db.server': `export const db = { now: () => 'now', read: () => 'read' }`,
    })
    expect(await module.fn_createServerFn_handler({})).toEqual([
      'createClientOnlyFn() functions can only be called on the client!',
      'now',
      'read',
    ])
  })
})

/** Compiles a module with `<Hydrate>` for the client and loads its chunks. */
async function compileHydrate(code: string) {
  const plugin = createHydrateCompilerPlugin()
  const { code: parent } = await compile('client', code, [plugin])
  expect(parent).not.toBeNull()
  expect(await getModuleErrors(parent!)).toEqual([])
  const chunks: Array<string> = []
  for (const [, , id] of parent!.matchAll(/import\((["'])(.+?)\1\)/g)) {
    const chunk = plugin.loadVirtualModule?.({
      id: id!,
      root: '/test',
      env: 'client',
      envName: 'client',
    })
    expect(await getModuleErrors(chunk!.code)).toEqual([])
    chunks.push(chunk!.code)
  }
  const index = (chunk: string) =>
    Number(chunk.match(/export function H(\d+)\(/)?.[1] ?? -1)
  chunks.sort((a, b) => index(a) - index(b))
  return { parent: parent!, chunks }
}

/** Renders a chunk export to a string: JSX becomes nested tags. */
async function renderChunk(
  chunk: string,
  exportName: string,
  props: Record<string, unknown> = {},
) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const jsx = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, (props: unknown) => string> = await import(
    /* @vite-ignore */ dataUrl(jsx + code)
  )
  return module[exportName]!(props)
}

describe('ported SolidStart directives: Hydrate children captures', () => {
  // validate.ts (assertHoistable): every binding the moved code reads must
  // still resolve where it lands. Main treats enums and namespaces as types:
  // a local enum is not passed to the chunk and a module-level enum or
  // namespace used only by split children stays in the parent, so the chunk
  // throws `ReferenceError` when it renders.
  test('enums and namespaces read by split children reach the chunk', async () => {
    const { parent, chunks } =
      await compileHydrate(`import { Hydrate } from '@tanstack/react-start'
enum Size {
  Large = 'large',
}
namespace Labels {
  export const red = 'red'
}
export function Page() {
  enum Color {
    Red = 'red',
  }
  return <>
    <Hydrate><p>{Color.Red}</p></Hydrate>
    <Hydrate><p>{Size.Large + ':' + Labels.red}</p></Hydrate>
  </>
}`)
    expect(chunks).toHaveLength(2)
    expect(parent).toMatch(/Color=\{Color\}/)
    expect(await renderChunk(chunks[0]!, 'H0', { Color: { Red: 'red' } })).toBe(
      '<p>red</p>',
    )
    expect(await renderChunk(chunks[1]!, 'H1')).toBe('<p>large:red</p>')
  })
})
