/**
 * Edge cases ported from the Qwik optimizer test suite
 * (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT). Qwik's `$()`
 * extracts lexical scopes into separate modules; `<Hydrate>` moves its
 * children into a lazy chunk the same way, and server functions and route
 * code splitting move module-level code between modules. Each test names the
 * Qwik test it is ported from.
 */
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'
import {
  compileHydrate,
  createStartCompiler,
  evaluateModule,
  getChunkIds,
  getChunkParams,
  loadChunk,
  renderChunk,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'

/** Compiles a loaded split chunk under its virtual module id, like the bundler. */
function compileChunk(
  plugin: ReturnType<typeof createHydrateCompilerPlugin>,
  code: string,
  id: string,
) {
  return createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  }).compile(code, id)
}

/** Boundary ids (`h` props) a compiled module renders, in source order. */
function getBoundaryIds(code: string) {
  return [...code.matchAll(/\bh=\s*["']([^"']+)["']/g)].map(([, id]) => id!)
}

const startStubs = {
  '@tanstack/react-start': {
    Hydrate: (props: { children: unknown }) => props.children,
  },
  '@tanstack/react-router': {
    // The lazy component renders the props the parent passes to the chunk.
    lazyRouteComponent: () => (props: Record<string, unknown>) =>
      `lazy(${Object.keys(props)
        .filter((name) => name !== 'children')
        .sort()
        .map((name) => `${name}=${String(props[name])}`)
        .join(',')})`,
  },
}

/** Top-level binding names a module declares, from any declaration form. */
function getDeclaredNames(code: string) {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const names = new Set<string>()
  const addPattern = (pattern: any): void => {
    switch (pattern?.type) {
      case 'Identifier':
        names.add(pattern.name)
        return
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          addPattern(
            property.type === 'RestElement'
              ? property.argument
              : property.value,
          )
        }
        return
      case 'ArrayPattern':
        pattern.elements.forEach(addPattern)
        return
      case 'AssignmentPattern':
        addPattern(pattern.left)
        return
      case 'RestElement':
        addPattern(pattern.argument)
        return
    }
  }
  for (const statement of program.body as Array<any>) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        addPattern(declarator.id)
      }
    } else if (declaration?.id?.name) {
      names.add(declaration.id.name)
    }
  }
  return names
}

describe('Hydrate split captures (ported from the Qwik optimizer)', () => {
  // Qwik: jsx_tag_named_like_inlined_const, destructured_prop_named_like_jsx_tag
  test('client: a local named like an intrinsic tag is captured as a value only', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ title }) {
  const div = 'text'
  return <Hydrate><div><title>{title + ':' + div}</title></div></Hydrate>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual(['div', 'title'])
    expect(await renderChunk(chunks[0]!, { title: 'Hello', div: 'text' })).toBe(
      '<div><title>Hello:text</title></div>',
    )
  })

  // Qwik: jsx_tag_names_are_not_segment_uses, jsx_lowercase_tag_outside_segments
  test('client: module-level bindings named like intrinsic tags stay out of the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const div = sideEffect('div')
const title = sideEffect('title')
console.log(div, title)
export function Page() {
  return <Hydrate><div title="hello">x</div></Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).not.toContain('sideEffect')
    expect(await renderChunk(chunks[0]!)).toBe('<div>x</div>')
  })

  // Qwik: local_shadowing_destructured_prop, nested_destructure_rebinding_prop_name,
  // should_not_auto_export_var_shadowed_in_{catch,do_while,switch,labeled_block}
  test('client: names re-declared inside the children are not captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ value, kind }) {
  const x = 'outer'
  console.log(x)
  return <Hydrate>
    <input value={value} onChange={(e) => { const value = e.target.value; return value }} />
    <p>{(() => { try { throw new Error('e') } catch (err) { const x = 'catch:' + err.message; return x } })()}</p>
    <p>{(() => { let i = 0; do { const x = i; i += x + 1 } while (i < 3); return i })()}</p>
    <p>{(() => { switch (kind) { case 'a': { const x = 'case'; return x } } return 'none' })()}</p>
    <p>{(() => { block: { const x = 'labeled'; if (x) break block } return 'after' })()}</p>
  </Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(getChunkParams(chunks[0]!)).toEqual(['kind', 'value'])
    expect(await renderChunk(chunks[0]!, { value: 'v', kind: 'a' })).toBe(
      '<input></input><p>catch:e</p><p>3</p><p>case</p><p>after</p>',
    )
  })

  // Qwik: should_transform_handlers_capturing_cross_scope_in_nested_loops
  test('client: block-scoped locals of nested loop callbacks are captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Grid({ matrix }) {
  return <div>{matrix.map((row, i) => {
    const rowIndex = i + 1
    return <div key={i}>{row.map((cell, j) => {
      const cellIndex = j + 1
      return <Hydrate key={j}><b>{cell + rowIndex + '-' + cellIndex}</b></Hydrate>
    })}</div>
  })}</div>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(getChunkParams(chunks[0]!)).toEqual([
      'cell',
      'cellIndex',
      'rowIndex',
    ])
    expect(
      await renderChunk(chunks[0]!, { cell: 'c', rowIndex: 2, cellIndex: 1 }),
    ).toBe('<b>c2-1</b>')
  })

  // Qwik: example_capturing_fn_class
  test('client: local function and class declarations are captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  function hola() { return 'hola' }
  class Thing { label = 'thing' }
  return <Hydrate><p>{hola() + ':' + new Thing().label}</p></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['Thing', 'hola'])
    expect(
      await renderChunk(chunks[0]!, {
        hola: () => 'hola',
        Thing: class {
          label = 'thing'
        },
      }),
    ).toBe('<p>hola:thing</p>')
  })

  // Qwik: example_capturing_fn_class (class component scope)
  test('client: locals of a class render method are captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Component } from 'react'
import { Hydrate } from '@tanstack/react-start'
export class Page extends Component {
  render() {
    const { label } = this.props
    return <Hydrate><p>{label}</p></Hydrate>
  }
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['label'])
    expect(await renderChunk(chunks[0]!, { label: 'L' })).toBe('<p>L</p>')
  })

  // Qwik: example_functional_component_capture_props, example_multi_capture
  test('client: deeply destructured params with defaults and rests are captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page({ count, rest: [I2, { I3, v1: [I4], I5 = 'd5', ...I6 }, I7 = 'd7', ...I8] }) {
  return <Hydrate><p>{[count, I2, I3, I4, I5, JSON.stringify(I6), I7, I8.length, (({ aaa }) => aaa)({ aaa: 'A' })].join('|')}</p></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual([
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I8',
      'count',
    ])
    expect(
      await renderChunk(chunks[0]!, {
        count: 1,
        I2: 'i2',
        I3: 'i3',
        I4: 'i4',
        I5: 'd5',
        I6: { extra: 'x' },
        I7: 'd7',
        I8: [],
      }),
    ).toBe('<p>1|i2|i3|i4|d5|{"extra":"x"}|d7|0|A</p>')
  })

  // Qwik: example_spread_jsx, should_convert_rest_props
  test('client: spread props and rest params are captured', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
function Child(props) { return <b>{props.a + props.extra}</b> }
export function Page({ id, ...rest }) {
  const extra = '!'
  return <Hydrate><Child {...rest} {...{ extra }} /></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['extra', 'rest'])
    expect(
      await renderChunk(chunks[0]!, { rest: { a: 'A' }, extra: '!' }),
    ).toBe('<b>A!</b>')
  })

  // Qwik: should_wrap_type_asserted_variables_in_template
  test('client: local types used by the children are not captured as values', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import type { Shape } from './types'
function format<T>(value: T) { return String(value) }
export function Page({ v }: { v: unknown }) {
  type Local = string
  interface Box { value: Local }
  return <Hydrate><p>{format<Local>(v as Local) + (v satisfies unknown as Box['value'] as Shape)}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual(['v'])
    expect(await renderChunk(chunks[0]!, { v: 'x' })).toBe('<p>xx</p>')
  })

  // Qwik: example_qwik_conflict, import_collision_with_renaming
  test('client: generated names do not collide with user bindings or imports', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { lazyRouteComponent } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
const _lazyRouteComponent = 'user'
export const Lazy = lazyRouteComponent(() => import('./other'))
export function Page() {
  const _H0 = 'local'
  const _H0_preload = 'preload'
  return <Hydrate prefetch><p>{_lazyRouteComponent + _H0 + _H0_preload}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    // The lazy chunk component must not be shadowed by the captured locals.
    const module = await evaluateModule(parent, startStubs)
    expect(module.Page!()).toBe('lazy(_H0=local,_H0_preload=preload)')
    expect(
      await renderChunk(chunks[0]!, { _H0: 'local', _H0_preload: 'preload' }),
    ).toBe('<p>userlocalpreload</p>')
  })

  // Qwik: example_capture_imports, example_qwik_conflict (locals shadowing imports)
  test('client: a captured local shadowing an import or module binding wins inside the children only', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import { label } from './labels'
import { Row } from './row'
const value = 'module'
function Show() { return <b>{value + ':' + label}</b> }
export function Page() {
  const label = 'local'
  const value = 'local-value'
  return <Hydrate><Row text={label} /><Show /><i>{value}</i></Hydrate>
}
`,
    )
    expect(getChunkParams(chunks[0]!)).toEqual(['label', 'value'])
    expect(
      await renderChunk(
        chunks[0]!,
        { label: 'local', value: 'local-value' },
        {
          './labels': { label: 'imported' },
          './row': { Row: ({ text }: { text: string }) => `<r>${text}</r>` },
        },
      ),
    ).toBe('<r>local</r><b>module:imported</b><i>local-value</i>')
  })

  // Qwik: example_capture_imports, jsx_member_tag_object_is_captured (imports)
  test('client: default, namespace and aliased imports used by the children move into the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import Chart from './chart'
import * as UI from './ui'
import { format as fmt, default as theme } from './format'
export function Page() {
  return <Hydrate><Chart /><UI.Button label={fmt(theme)} /></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(
      await renderChunk(
        chunks[0]!,
        {},
        {
          './chart': { default: () => '<chart></chart>' },
          './ui': {
            Button: ({ label }: { label: string }) =>
              `<button>${label}</button>`,
          },
          './format': {
            format: (value: string) => `[${value}]`,
            default: 'dark',
          },
        },
      ),
    ).toBe('<chart></chart><button>[dark]</button>')
  })

  // Qwik: issue_964 (generators), example_use_server_mount (async scopes)
  test('client: generators and async callbacks inside the children stay valid', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
async function save() {}
export async function Page() {
  return <Hydrate><p>{[...(function* () { yield 'a'; yield 'b' })()].join('')}</p><button onClick={async () => { await save() }}>s</button></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>ab</p><button>s</button>')
  })

  // Qwik: example_jsx (namespaced names inside the extracted scope)
  test('client: namespaced JSX names in the children stay valid', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Icon() {
  return <Hydrate><svg><use xlink:href="#icon" /></svg></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(chunks[0]).toContain('xlink:href')
  })

  // Qwik: should_handle_dangerously_set_inner_html (string attributes)
  test('client: string attributes keep their value in the chunk', async () => {
    const element = `<span title="Fish &amp; Chips &copy;" data-q='say "hi"' data-n="a
b" dangerouslySetInnerHTML={{ __html: "<h1>I'm an h1!</h1>" }} />`
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate>${element}</Hydrate>
}
`,
    )
    const propsRuntime = `const Fragment = null
const h = (type, props) => JSON.stringify(props)
`
    const expected = await evaluateModule(
      `export const H0 = () => ${element}`,
      {},
      propsRuntime,
    )
    const module = await evaluateModule(chunks[0]!, {}, propsRuntime)
    expect(module.H0!({})).toBe(expected.H0!())
  })

  // Qwik: example_default_export
  test('client: an anonymous default-exported component splits its boundary', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const label = 'default'
export default () => <Hydrate><p>{label}</p></Hydrate>
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>default</p>')
  })
})

describe('Hydrate split module-level code (ported from the Qwik optimizer)', () => {
  // Qwik: example_invalid_references
  test('client: module-level destructuring with defaults and rests moves into the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const obj = ['m2', { M3: 'm3', v1: ['m4'], extra: 'x' }]
const v2 = 'd5'
const v3 = 'd7'
const [M2, { M3, v1: [M4], M5 = v2, ...M6 }, M7 = v3, ...M8] = obj
export function Page() {
  return <Hydrate><p>{[M2, M3, M4, M5, JSON.stringify(M6), M7, M8.length].join('|')}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe(
      '<p>m2|m3|m4|d5|{"extra":"x"}|d7|0</p>',
    )
  })

  // Qwik: should_preserve_let_when_migrated_into_segment
  test('client: a module-level let used only by the children stays mutable', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
let renders = 0
export function Page() {
  return <Hydrate><p>{++renders}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    const module = await evaluateModule(chunks[0]!)
    expect(module.H0!({})).toBe('<p>1</p>')
    expect(module.H0!({})).toBe('<p>2</p>')
  })

  // Qwik: should_keep_non_migrated_binding_from_shared_destructuring_declarator
  // (+ _array_destructuring_declarator, _with_default, _with_rest)
  test.each([
    { name: 'object', declaration: `const { a, b } = { a: 'A', b: 'B' }` },
    { name: 'array', declaration: `const [a, b] = ['A', 'B']` },
    { name: 'default', declaration: `const { a = 'A', b } = { b: 'B' }` },
    { name: 'rest', declaration: `const { a, ...b } = { a: 'A', c: 'B' }` },
  ])(
    'client: an $name destructuring shared by the parent and the children keeps both bindings',
    async ({ declaration }) => {
      const { parent, chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
${declaration}
export const fromRoot = () => JSON.stringify(b)
export function Page() {
  return <Hydrate><p>{a}</p></Hydrate>
}
`,
      )
      expect(await getModuleErrors(parent)).toEqual([])
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(getDeclaredNames(parent).has('b')).toBe(true)
      const module = await evaluateModule(parent, startStubs)
      expect(module.fromRoot!()).toMatch(/B/)
      expect(await renderChunk(chunks[0]!)).toBe('<p>A</p>')
    },
  )

  // Qwik: should_migrate_destructured_binding_with_imported_dependency
  test('client: a module-level destructuring of an import moves into the chunk with the import', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
import { source } from './lib'
const { a } = source
export function Page() {
  return <Hydrate><p>{a}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(
      await renderChunk(chunks[0]!, {}, { './lib': { source: { a: 'A' } } }),
    ).toBe('<p>A</p>')
  })

  // Qwik: should_keep_root_var_used_by_export_decl_and_qrl,
  // should_keep_root_var_used_by_exported_function_and_qrl
  test('client: a module-level binding also used by exports stays in the parent', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const shared = { id: 'abc' }
export const exportedValue = shared.id
export function readShared() { return shared.id }
export function Page() {
  return <Hydrate><p>{shared.id}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    const module = await evaluateModule(parent, startStubs)
    expect(module.exportedValue).toBe('abc')
    expect(module.readShared!()).toBe('abc')
    expect(await renderChunk(chunks[0]!)).toBe('<p>abc</p>')
  })

  // Qwik: example_segment_variable_migration,
  // variable_migration_transitive_dep_used_by_other_segment
  test('client: helpers shared by two boundaries and the parent stay available to each', async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const scrollState = (el) => ({ x: el.x, y: el.y })
const saveScroll = (s) => s.x + s.y
const bigHelper = (el) => saveScroll(scrollState(el))
export const direct = () => saveScroll(scrollState({ x: 1, y: 1 }))
export function App() {
  return <><Hydrate><p>{bigHelper({ x: 1, y: 2 })}</p></Hydrate><Hydrate><p>{scrollState({ x: 3, y: 4 }).y}</p></Hydrate></>
}
`,
    )
    expect(chunks).toHaveLength(2)
    expect(await getModuleErrors(parent)).toEqual([])
    const module = await evaluateModule(parent, startStubs)
    expect(module.direct!()).toBe(2)
    expect(await renderChunk(chunks[0]!)).toBe('<p>3</p>')
    expect(await renderChunk(chunks[1]!)).toBe('<p>4</p>')
  })

  // Qwik: example_ts_enums (TypeScript-only declaration forms)
  test('client: an overloaded function used by the children keeps its implementation', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
function label(value: string): string
function label(value: number): string
function label(value: unknown) { return 'label:' + String(value) }
export function Page() {
  return <Hydrate><p>{label(1)}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!)).toBe('<p>label:1</p>')
  })
})

describe('Hydrate boundary placement (ported from the Qwik optimizer)', () => {
  // Qwik: nested_segment_param_does_not_collide_with_captured_props
  test('client: a nested boundary receives the captures of its enclosing boundary', async () => {
    const code = `import { Hydrate } from '@tanstack/react-start'
export function Page({ isOpen, fee }) {
  const label = 'fee'
  return <Hydrate><section><Hydrate><p>{label + ':' + (isOpen ? fee : 0)}</p></Hydrate></section></Hydrate>
}
`
    const server = await compileHydrate('server', code)
    const { parent, chunks, plugin } = await compileHydrate('client', code)
    expect(getChunkParams(chunks[0]!)).toEqual(['fee', 'isOpen', 'label'])
    // The bundler compiles the loaded chunk like any other module.
    const outer = await compileChunk(
      plugin,
      chunks[0]!,
      getChunkIds(parent)[0]!,
    )
    expect(outer).not.toBeNull()
    expect(await getModuleErrors(outer!)).toEqual([])
    expect([...getBoundaryIds(parent), ...getBoundaryIds(outer!)]).toEqual(
      getBoundaryIds(server.parent),
    )
    for (const name of ['fee', 'isOpen', 'label']) {
      expect(outer).toContain(`${name}={${name}}`)
    }
    const inner = loadChunk(plugin, 'client', getChunkIds(outer!)[0]!)
    expect(inner).not.toBeNull()
    expect(getChunkParams(inner!)).toEqual(['fee', 'isOpen', 'label'])
    expect(
      await renderChunk(inner!, { label: 'fee', isOpen: true, fee: 5 }),
    ).toBe('<p>fee:5</p>')
  })

  // Qwik: example_mutable_children, issue_5008
  test('client: boundaries in conditionals and callbacks load the chunk the server id names', async () => {
    const code = `import { Hydrate } from '@tanstack/react-start'
export function Page({ flag, items }) {
  return <div>
    {flag ? <Hydrate><p>yes</p></Hydrate> : <Hydrate><p>no</p></Hydrate>}
    {flag && <Hydrate><p>and</p></Hydrate>}
    {items.map(function (item, idx) { return <Hydrate key={idx}><p>{'fn' + item}</p></Hydrate> })}
    {items.map((item) => <Hydrate key={item}><p>{'arrow' + item}</p></Hydrate>)}
  </div>
}
export function Other({ early }) {
  if (early) { return <Hydrate><p>early</p></Hydrate> }
  return <Hydrate><p>late</p></Hydrate>
}
`
    const server = await compileHydrate('server', code)
    const { parent, plugin } = await compileHydrate('client', code)
    const serverIds = getBoundaryIds(server.parent)
    expect(serverIds).toHaveLength(7)
    expect(getBoundaryIds(parent)).toEqual(serverIds)
    const rendered: Array<unknown> = []
    for (const id of serverIds) {
      const chunkId = getChunkIds(parent).find((chunk) =>
        chunk.endsWith(`=${id}`),
      )
      expect(chunkId).toBeDefined()
      rendered.push(
        await renderChunk(loadChunk(plugin, 'client', chunkId!)!, {
          item: 'x',
        }),
      )
    }
    expect(rendered).toEqual([
      '<p>yes</p>',
      '<p>no</p>',
      '<p>and</p>',
      '<p>fnx</p>',
      '<p>arrowx</p>',
      '<p>early</p>',
      '<p>late</p>',
    ])
  })
})

describe('Hydrate server fallback stripping (ported from the Qwik optimizer)', () => {
  // Qwik: example_functional_component_capture_props (params used by a
  // stripped scope)
  test('server: params used only by the fallback keep later params in place', async () => {
    const { parent } = await compileHydrate(
      'server',
      `import { Hydrate } from '@tanstack/react-start'
export function List({ items }) {
  return <ul>{items.map((item, i) => <Hydrate key={i} fallback={<p>{item}</p>}><li>{i}</li></Hydrate>)}</ul>
}
export function Card(label, body) {
  return <Hydrate fallback={<p>{label}</p>}><p>{body}</p></Hydrate>
}
`,
    )
    expect(await getModuleErrors(parent)).toEqual([])
    const module = await evaluateModule(parent, startStubs)
    expect(module.List!({ items: ['a', 'b'] })).toBe(
      '<ul><li>0</li><li>1</li></ul>',
    )
    expect(module.Card!('L', 'B')).toBe('<p>B</p>')
  })

  // Qwik: should_transform_handler_in_for_of_loop, should_not_auto_export_var_shadowed_in_catch
  test.each([
    {
      name: 'a for-of loop variable',
      code: `import { Hydrate } from '@tanstack/react-start'
export function List({ xs }) {
  const out = []
  for (const x of xs) out.push(<Hydrate fallback={<p>{x}</p>}><p>child</p></Hydrate>)
  return out
}
`,
    },
    {
      name: 'a catch param',
      code: `import { Hydrate } from '@tanstack/react-start'
export function Safe({ run }) {
  try {
    return run()
  } catch (error) {
    return <Hydrate fallback={<p>{error.message}</p>}><p>child</p></Hydrate>
  }
}
`,
    },
  ])(
    'server: $name used only by the fallback keeps the module valid',
    async ({ code }) => {
      const { parent } = await compileHydrate('server', code)
      expect(await getModuleErrors(parent)).toEqual([])
    },
  )

  // Qwik: should_keep_non_migrated_binding_from_shared_destructuring_declarator
  test('server: a destructuring shared by the fallback and the children keeps the children binding', async () => {
    const { parent } = await compileHydrate(
      'server',
      `import { Hydrate } from '@tanstack/react-start'
export function Page(props) {
  const { a, b } = props
  return <Hydrate fallback={<p>{a}</p>}><p>{b}</p></Hydrate>
}
`,
    )
    const module = await evaluateModule(parent, startStubs)
    expect(module.Page!({ a: 'A', b: 'B' })).toBe('<p>B</p>')
  })
})

/** Server function ids in a compiled module: client callers or providers. */
function getRpcIds(
  code: string,
  callee: 'createClientRpc' | 'createServerRpc',
) {
  const pattern =
    callee === 'createClientRpc'
      ? /createClientRpc\(\s*["']([^"']+)["']/g
      : /createServerRpc\(\s*\{\s*["']?id["']?\s*:\s*["']([^"']+)["']/g
  return [...code.matchAll(pattern)].map(([, id]) => id!)
}

describe('server functions (ported from the Qwik optimizer)', () => {
  // Qwik: example_strip_exports_used (server code referenced from an extracted scope)
  test.each([
    {
      name: 'an exported server fn also called by the parent',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hi')
export function Page() {
  return <><button onClick={() => greet()}>a</button><Hydrate><button onClick={() => greet()}>b</button></Hydrate></>
}
`,
    },
    {
      name: 'a private server fn only called by the children',
      code: `import { Hydrate, createServerFn } from '@tanstack/react-start'
const greet = createServerFn().handler(async () => 'hi')
export function Page() {
  return <Hydrate><button onClick={() => greet()}>b</button></Hydrate>
}
`,
    },
  ])(
    'client: $name calls the provider id from the split chunk',
    async ({ code }) => {
      const { parent, chunks, plugin } = await compileHydrate('client', code)
      const chunk = await compileChunk(
        plugin,
        chunks[0]!,
        getChunkIds(parent)[0]!,
      )
      const provider = await compileStartModule({
        env: 'server',
        provider: true,
        code,
      })
      expect(chunk).not.toBeNull()
      expect(await getModuleErrors(chunk!)).toEqual([])
      // The handler itself stays on the server.
      expect(chunk).not.toContain("'hi'")
      const providerIds = getRpcIds(provider!, 'createServerRpc')
      expect(providerIds).toHaveLength(1)
      expect(getRpcIds(chunk!, 'createClientRpc')).toEqual(providerIds)
    },
  )

  // Qwik: example_drop_side_effects,
  // should_not_auto_export_var_shadowed_in_{catch,do_while,switch,labeled_block}
  test('client: handler-only module state is dropped even when client code shadows its name', async () => {
    const code = `import { createServerFn } from '@tanstack/react-start'
import { createDb } from './db.server'
import { secret } from './secret'
const db = createDb(secret)
export const list = createServerFn().handler(async () => db.list())
export function clientOnly(kind) {
  try { return kind() } catch (err) { const db = 'catch'; return db }
}
export function other(kind) {
  let i = 0
  do { const db = i; i += db + 1 } while (i < 3)
  switch (kind) { case 'a': { const db = 'case'; return db } }
  block: { const db = 'labeled'; if (db) break block }
  return i
}
`
    const client = await compileStartModule({ env: 'client', code })
    const provider = await compileStartModule({
      env: 'server',
      provider: true,
      code,
    })
    expect(await getModuleErrors(client!)).toEqual([])
    expect(client).not.toContain('createDb')
    expect(client).not.toContain('./secret')
    expect(await getModuleErrors(provider!)).toEqual([])
    expect(provider).toContain('createDb(secret)')
  })

  // Qwik: should_not_inline_exported_var_into_segment
  test('an exported validator computed from module state stays declared once', async () => {
    const code = `import { createServerFn } from '@tanstack/react-start'
import { wrapperFn, getEnv } from './utils'
const flagEnabled = getEnv().PUBLIC_FEATURE
export const FeatureSchema = wrapperFn(flagEnabled)
export const featureAction = createServerFn({ method: 'POST' })
  .inputValidator(FeatureSchema)
  .handler(async () => ({ status: 'success' }))
`
    const client = await compileStartModule({ env: 'client', code })
    const provider = await compileStartModule({
      env: 'server',
      provider: true,
      code,
    })
    for (const output of [client!, provider!]) {
      expect(await getModuleErrors(output)).toEqual([])
    }
    expect(getDeclaredNames(client!).has('FeatureSchema')).toBe(true)
    expect(provider!.match(/wrapperFn\(/g)).toHaveLength(1)
  })

  // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
  test('module state shared by a handler and client code stays in both outputs', async () => {
    const code = `import { createServerFn } from '@tanstack/react-start'
const state = { counter: 0 }
export function bump() { return ++state.counter }
export const read = createServerFn().handler(async () => state.counter)
`
    const client = await compileStartModule({ env: 'client', code })
    const provider = await compileStartModule({
      env: 'server',
      provider: true,
      code,
    })
    expect(await getModuleErrors(client!)).toEqual([])
    expect(await getModuleErrors(provider!)).toEqual([])
    expect(getDeclaredNames(client!).has('state')).toBe(true)
    expect(getDeclaredNames(provider!).has('state')).toBe(true)
  })
})
