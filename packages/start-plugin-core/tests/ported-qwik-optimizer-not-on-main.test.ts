/**
 * Edge cases ported from the Qwik optimizer test suite
 * (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT) that the Yuku
 * compiler handles and the Babel compiler did not. Each test names the Qwik
 * test it is ported from.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { getModuleErrors } from './validate-module'

const parentId = '/test/src/module.tsx'
type Env = 'client' | 'server'
type HydratePlugin = ReturnType<typeof createHydrateCompilerPlugin>

/**
 * Compiles one module through `StartCompiler` like the bundler plugins do: the
 * parent module, or a loaded split chunk under its virtual module id.
 */
async function compileModule(
  plugin: HydratePlugin,
  env: Env,
  code: string,
  id = parentId,
) {
  const compiler: StartCompiler = new StartCompiler({
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
    compilerPlugins: [plugin],
  })
  const result = await compiler.compile({
    code,
    id,
    detectedKinds: detectKindsInCode(code, env),
  })
  return result?.code ?? null
}

/** The Hydrate chunk ids a compiled module imports, in source order. */
function getChunkIds(code: string) {
  return [...code.matchAll(/import\((["'])(.+?)\1\)/g)]
    .map(([, , id]) => id!)
    .filter((id) => id.includes('tss-hydrate='))
}

function loadChunk(plugin: HydratePlugin, env: Env, id: string) {
  return (
    plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    })?.code ?? null
  )
}

/** Compiles a module with `<Hydrate>` and loads the split chunks it imports. */
async function compileHydrate(env: Env, code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileModule(plugin, env, code)
  if (parent === null) {
    throw new Error('expected the module to be transformed')
  }
  const chunks = getChunkIds(parent).map((id) => {
    const chunk = loadChunk(plugin, env, id)
    if (chunk === null) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return chunk
  })
  // Order chunks by boundary index, however the parent declares them.
  const index = (chunk: string) =>
    Number(chunk.match(/export function H(\d+)\(/)?.[1] ?? -1)
  chunks.sort((a, b) => index(a) - index(b))
  return { parent, chunks, plugin }
}

/** The names a split chunk component receives as props. */
function getChunkParams(chunk: string) {
  const params = chunk.match(/export function H\d+\(([^)]*)\)/)?.[1] ?? ''
  return [...params.matchAll(/[\w$]+/g)].map(([name]) => name).sort()
}

const stubsKey = '__portedQwikOptimizerStubs'
let evaluations = 0

/** Renders JSX to text: intrinsic elements become tags, components are called. */
const renderRuntime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/**
 * Evaluates a compiled module like a bundler would: JSX becomes plain calls
 * of the `runtime`, and imports are linked to `stubs`, keyed by specifier.
 */
async function evaluate(
  code: string,
  stubs: Record<string, Record<string, unknown>> = {},
  runtime = renderRuntime,
): Promise<Record<string, (...args: Array<any>) => unknown>> {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const key = `${stubsKey}${evaluations++}`
  ;(globalThis as Record<string, unknown>)[key] = stubs
  // Imports are hoisted: link them before any other statement runs.
  const imports: Array<string> = []
  const body = javascript.replace(
    /^import\s+(.+?)\s+from\s+(["'])(.+?)\2;?$/gm,
    (_, clause: string, __, source: string) => {
      if (!(source in stubs)) {
        throw new Error(`no stub for import ${source}`)
      }
      const from = `globalThis.${key}[${JSON.stringify(source)}]`
      const named = clause.match(/\{(.*)\}/)?.[1]
      const head = clause
        .replace(/\{.*\}/, '')
        .replace(/,\s*$/, '')
        .trim()
      if (named) {
        imports.push(`const { ${named.replace(/\bas\b/g, ':')} } = ${from};`)
      }
      if (head.startsWith('* as ')) {
        imports.push(`const ${head.slice(5)} = ${from};`)
      } else if (head) {
        imports.push(`const ${head} = ${from}.default;`)
      }
      return ''
    },
  )
  const linked = `${imports.join('\n')}\n${body}`
  return import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + linked)}`
  )
}

/** Renders a chunk's component export with the given props. */
async function renderChunk(
  chunk: string,
  props: Record<string, unknown> = {},
  stubs: Record<string, Record<string, unknown>> = {},
) {
  const module = await evaluate(chunk, stubs)
  const name = Object.keys(module).find((key) => /^H\d+$/.test(key))
  if (!name) {
    throw new Error('expected the chunk to export a component')
  }
  return module[name]!(props)
}

describe('Hydrate split captures fixed by the Yuku compiler (ported from the Qwik optimizer)', () => {
  // Qwik: jsx_member_tag_object_is_captured, destructured_prop_used_as_member_tag
  test('client: the object of a member-expression tag is captured', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
function Home() { return <i>home</i> }
export function Page({ Model }) {
  const ui = { Home }
  return <Hydrate><ui.Home /><Model.Item /></Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual(['Model', 'ui'])
    expect(parent).toContain('ui={ui}')
    expect(
      await renderChunk(chunks[0]!, {
        ui: { Home: () => '<i>home</i>' },
        Model: { Item: () => '<b>item</b>' },
      }),
    ).toBe('<i>home</i><b>item</b>')
  })

  // Qwik: jsx_underscore_component_tag
  test('client: a local component whose name starts with _ or $ is captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ label }) {
  const _Row = () => <b>{label}</b>
  const $Cell = () => <i>cell</i>
  return <Hydrate><_Row /><$Cell /></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['$Cell', '_Row'])
    expect(
      await renderChunk(chunks[0]!, {
        _Row: () => '<b>row</b>',
        $Cell: () => '<i>cell</i>',
      }),
    ).toBe('<b>row</b><i>cell</i>')
  })

  // Qwik: jsx_tag_names_are_not_segment_uses (non-reference identifiers)
  test('client: property names, method keys and optional members are not captures', async () => {
    // A spurious `later={later}` prop would read `later` before it is
    // initialized and throw.
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ obj }) {
  const el = <Hydrate><p>{obj?.later + ({ later() { return '!' } }).later()}</p></Hydrate>
  const later = 1
  console.log(later)
  return el
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['obj'])
    expect(await renderChunk(chunks[0]!, { obj: { later: 'L' } })).toBe(
      '<p>L!</p>',
    )
  })

  // Qwik: should_not_auto_export_var_shadowed_in_labeled_block
  test('client: a statement label named like an outer local is not captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  const label = 'outer'
  console.log(label)
  return <Hydrate><p>{(() => { label: { break label } return 'after' })()}</p></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>after</p>')
  })

  // Qwik: example_exports
  test('client: exported declarations of every form used by the children reach the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export const [a, { b }] = ['a', { b: 'b' }]
const exp1 = 'e1'
const internal = 'i'
export { exp1, internal as expr2 }
export function foo() { return 'foo' }
export class Bar { static id = 'bar' }
export default function DefaultFn() { return 'default' }
export function Page() {
  return <Hydrate><p>{[a, b, exp1, internal, foo(), Bar.id, DefaultFn()].join('|')}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe(
      '<p>a|b|e1|i|foo|bar|default</p>',
    )
  })

  // Qwik: example_ts_enums
  test('client: TypeScript enums and namespaces used by the children reach the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export enum Tone { Loud = 'LOUD' }
namespace Labels { export const quiet = 'quiet' }
export function Page() {
  return <Hydrate><p>{Tone.Loud + ':' + Labels.quiet}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>LOUD:quiet</p>')
  })

  // Qwik: example_use_optimization (use* calls inside the extracted scope)
  test('client: an optional hook call in the children is rejected', async () => {
    await expect(
      compileHydrate(
        'client',
        `import { useId } from 'react'
import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p id={useId?.()}>x</p></Hydrate>
}
`,
      ),
    ).rejects.toThrow(/hook/i)
  })
})
