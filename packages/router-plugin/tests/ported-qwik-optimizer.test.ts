/**
 * Edge cases ported from the Qwik optimizer test suite
 * (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT). Qwik's `$()`
 * extracts lexical scopes into separate modules; `<Hydrate>` moves its
 * children into a lazy chunk the same way, and server functions and route
 * code splitting move module-level code between modules. Each test names the
 * Qwik test it is ported from.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getModuleErrors } from './validate-module'

const filename = 'route.tsx'

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const groupings = defaultCodeSplitGroupings
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: groupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings }
}

async function getErrorsByModule(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  return errors
}

function noErrors(modules: Record<string, string>) {
  return Object.fromEntries(Object.keys(modules).map((name) => [name, []]))
}

/**
 * How many times `pattern` occurs across the modules a bundle loads: the
 * reference module, the split chunks it imports and the shared module.
 */
function countAcrossModules(modules: Record<string, string>, pattern: RegExp) {
  const reference = modules.reference!
  return Object.entries(modules)
    .filter(
      ([name]) =>
        !name.startsWith('virtual ') ||
        reference.includes(`tsr-split=${name.slice('virtual '.length)}`),
    )
    .reduce(
      (count, [, code]) =>
        count + (code.match(new RegExp(pattern.source, 'g'))?.length ?? 0),
      0,
    )
}

const stubsKey = '__portedQwikRouteStubs'
let evaluations = 0

/**
 * Evaluates a split component chunk like a bundler would and renders its
 * component: JSX becomes plain calls (intrinsic elements render as tags,
 * components are called) and named imports are linked to `stubs`.
 */
async function renderSplitComponent(
  chunk: string,
  stubs: Record<string, Record<string, unknown>> = {},
) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const key = `${stubsKey}${evaluations++}`
  ;(globalThis as Record<string, unknown>)[key] = stubs
  // Imports are hoisted: link them before any other statement runs.
  const imports: Array<string> = []
  const body = code.replace(
    /^import\s+\{([^}]*)\}\s+from\s+(["'])(.+?)\2;?$/gm,
    (_, named: string, __, source: string) => {
      if (!(source in stubs)) {
        throw new Error(`no stub for import ${source}`)
      }
      imports.push(
        `const { ${named.replace(/\bas\b/g, ':')} } = globalThis.${key}[${JSON.stringify(source)}];`,
      )
      return ''
    },
  )
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, unknown> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`${runtime}${imports.join('\n')}\n${body}`)}`
  )
  return (module.component as () => string)()
}

describe('route code splitting (ported from the Qwik optimizer)', () => {
  // Qwik: should_keep_non_migrated_binding_from_shared_destructuring_declarator
  // (+ _array_destructuring_declarator, _with_default, _with_rest)
  it.each([
    { name: 'object', pattern: '{ a, b }' },
    { name: 'array', pattern: '[a, b]' },
    { name: 'default', pattern: `{ a = 'A', b }` },
    { name: 'rest', pattern: '{ a, ...b }' },
  ])(
    'evaluates an $name destructuring split between the loader and the component once',
    async ({ pattern }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import { makeConfig } from './config'
const ${pattern} = makeConfig()
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => <div>{JSON.stringify(b)}</div>,
})
`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
      expect(countAcrossModules(modules, /makeConfig\(\)/)).toBe(1)
    },
  )

  // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
  it('creates an exported context shared by a provider and the split component once', async () => {
    const { modules } = compileRouteModules(`
import { createContext, useContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Theme = createContext('light')
export function ThemeProvider({ children }) {
  return <Theme.Provider value="dark">{children}</Theme.Provider>
}
export const Route = createFileRoute('/')({
  component: () => <p>{useContext(Theme)}</p>,
})
`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    expect(countAcrossModules(modules, /createContext\(/)).toBe(1)
  })

  // Qwik: should_not_move_over_side_effects, example_drop_side_effects
  it.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      render: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      render: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
  ])(
    'renders a split component that relies on $name',
    async ({ setup, render, rendered }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
${setup}
export const Route = createFileRoute('/')({
  component: () => ${render},
})
`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
      expect(await renderSplitComponent(modules['virtual component']!)).toBe(
        rendered,
      )
    },
  )

  // Qwik: should_not_auto_export_var_shadowed_in_{catch,do_while,switch,labeled_block}
  it('keeps loader-only state out of the component chunk when the component shadows its name', async () => {
    const { modules, sharedBindings } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import { createDb } from './db'
const db = createDb()
export const Route = createFileRoute('/')({
  loader: () => db.list(),
  component: ({ kind }) => {
    try { JSON.parse(kind) } catch (err) { const db = 'catch'; console.log(db) }
    let i = 0
    do { const db = i; i += db + 1 } while (i < 3)
    switch (kind) { case 'a': { const db = 'case'; console.log(db) } }
    block: { const db = 'labeled'; if (db) break block }
    return <p>{i}</p>
  },
})
`)
    expect([...sharedBindings]).toEqual([])
    expect(modules['virtual component']).not.toContain('createDb')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Qwik: root_level_self_referential_qrl, example_self_referential_component_migration
  it('splits self-recursive and mutually recursive components without duplicating them', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
function Tree({ depth }) { return depth ? <ul><Tree depth={depth - 1} /></ul> : <i>leaf</i> }
function A({ depth }) { return depth ? <B depth={depth - 1} /> : <i>a</i> }
function B({ depth }) { return <b><A depth={depth} /></b> }
export const Route = createFileRoute('/')({
  component: () => <div><Tree depth={1} /><A depth={1} /></div>,
  errorComponent: () => <B depth={0} />,
})
`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    expect(countAcrossModules(modules, /function Tree\b/)).toBe(1)
    expect(countAcrossModules(modules, /function A\b/)).toBe(1)
    expect(countAcrossModules(modules, /function B\b/)).toBe(1)
  })

  // Qwik: example_ts_enums, example_exports
  it('moves enums, overloads and exported declarations used by the component into its chunk', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
enum Tone { Loud = 'LOUD' }
function label(value: string): string
function label(value: unknown) { return 'label:' + String(value) }
export default function DefaultFn() { return 'default' }
const internal = 'i'
export { internal as renamed }
export const Route = createFileRoute('/')({
  component: () => <p>{[Tone.Loud, label('x'), DefaultFn(), internal].join('|')}</p>,
})
`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    // The chunk may import exported bindings from the route module itself.
    expect(
      await renderSplitComponent(modules['virtual component']!, {
        [filename]: { default: () => 'default', renamed: 'i' },
      }),
    ).toBe('<p>LOUD|label:x|default|i</p>')
  })
})
