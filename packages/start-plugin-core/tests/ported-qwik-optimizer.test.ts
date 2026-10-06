/**
 * Known compiler bugs found by porting edge cases from the Qwik optimizer test
 * suite (QwikDev/qwik, packages/optimizer/core/src/test.rs, MIT), pinned as
 * expected failures. Each test names the Qwik test it is ported from.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { parseSync, transformWithOxc } from 'vite'
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

/** Boundary ids (`h` props) a compiled module renders, in source order. */
function getBoundaryIds(code: string) {
  return [...code.matchAll(/\bh=\s*["']([^"']+)["']/g)].map(([, id]) => id!)
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

describe('known Hydrate split bugs (ported from the Qwik optimizer)', () => {
  // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
  // Bug: module-level declarations used by the split children are copied into
  // the chunk instead of being shared with the parent module, so their
  // initializers run again. Impact: a context created in the route file is a
  // different object in the chunk; children reading it ignore the parent's
  // Provider and render the default value. Remove `.fails` once fixed.
  test.fails(
    'client: a context created at module level is not re-created by the chunk',
    async () => {
      const { chunks } = await compileHydrate(
        'client',
        `import { createContext, useContext } from 'react'
import { Hydrate } from '@tanstack/react-start'
const Theme = createContext('light')
function Label() { return <span>{useContext(Theme)}</span> }
export function Page() {
  return <Theme.Provider value="dark"><Hydrate><Label /></Hydrate></Theme.Provider>
}
`,
      )
      expect(chunks).toHaveLength(1)
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(chunks[0]).not.toContain('createContext(')
    },
  )

  // Qwik: should_auto_export_shared_let_kept_in_parent
  // Bug: a module-level `let` that the parent reassigns is copied into the
  // chunk with its initial value. Impact: the split children always render
  // the initial value instead of the current one. Remove `.fails` once fixed.
  test.fails(
    'client: a module-level let reassigned by the parent is not copied into the chunk',
    async () => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
let clicks = 0
export function bump() { clicks++ }
export function Page() {
  return <Hydrate><p>{clicks}</p></Hydrate>
}
`,
      )
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(getDeclaredNames(chunks[0]!).has('clicks')).toBe(false)
    },
  )

  // Qwik: should_not_move_over_side_effects, example_drop_side_effects
  // Bug: only declarations are moved into the chunk; top-level statements that
  // complete them (member assignments, registrations) are dropped. Impact:
  // compound components such as `<Card.Title />` are undefined in the chunk
  // and React throws "Element type is invalid"; registries are empty.
  // Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      children: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'Object.assign on a component',
      setup: `function Tabs({ children }) { return <ul>{children}</ul> }
Object.assign(Tabs, { Tab: () => <li>tab</li> })`,
      children: '<Tabs><Tabs.Tab /></Tabs>',
      rendered: '<ul><li>tab</li></ul>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      children: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
  ])(
    'client: $name that the children rely on reaches the chunk',
    async ({ setup, children, rendered }) => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
${setup}
export function Page() {
  return <Hydrate>${children}</Hydrate>
}
`,
      )
      expect(await getModuleErrors(chunks[0]!)).toEqual([])
      expect(await renderChunk(chunks[0]!)).toBe(rendered)
    },
  )

  // Qwik: root_level_self_referential_qrl, example_self_referential_component_migration
  // Bug: a component that renders itself (or a component that renders it)
  // inside its own boundary is copied into the chunk together with that
  // boundary. Compiling the chunk numbers the copy after the chunk's own
  // index, so it renders a boundary id the server never emitted, and its lazy
  // import points at a boundary that does not exist in the source. Impact:
  // nested boundaries of recursive components (trees, threads) do not match
  // the server ids and their chunks fail to load. Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a self-recursive component',
      code: `import { Hydrate } from '@tanstack/react-start'
export function Tree({ node }) {
  return <li>{node.label}<Hydrate><ul>{node.children.map((child) => <Tree node={child} />)}</ul></Hydrate></li>
}
`,
    },
    {
      name: 'mutually recursive components',
      code: `import { Hydrate } from '@tanstack/react-start'
function Branch({ depth }) { return depth ? <Leaf depth={depth - 1} /> : null }
export function Leaf({ depth }) {
  return <Hydrate><Branch depth={depth} /></Hydrate>
}
`,
    },
  ])(
    'client: $name keeps boundary ids aligned with the server',
    async ({ code }) => {
      const server = await compileHydrate('server', code)
      const serverIds = new Set(getBoundaryIds(server.parent))
      const { parent, chunks, plugin } = await compileHydrate('client', code)
      expect(chunks).toHaveLength(1)
      // The bundler compiles the loaded chunk like any other module.
      const chunk =
        (await compileModule(
          plugin,
          'client',
          chunks[0]!,
          getChunkIds(parent)[0]!,
        )) ?? chunks[0]!
      expect(await getModuleErrors(chunk)).toEqual([])
      for (const id of [...getBoundaryIds(parent), ...getBoundaryIds(chunk)]) {
        expect(serverIds).toContain(id)
      }
      for (const id of getChunkIds(chunk)) {
        expect(loadChunk(plugin, 'client', id)).not.toBeNull()
      }
    },
  )

  // Qwik: issue_5008 (function-expression callbacks inside the extracted scope)
  // Bug: every `this` inside the children is rejected, including `this` of a
  // nested non-arrow function, which the chunk does not need to capture.
  // Impact: valid code fails to build with "Hydrate cannot code-split JSX that
  // captures this". Remove `.fails` once fixed.
  test.fails(
    'client: this inside a function expression in the children is not a capture',
    async () => {
      const { chunks } = await compileHydrate(
        'client',
        `import { Hydrate } from '@tanstack/react-start'
export function Page({ items }) {
  return <Hydrate><ul>{items.map(function (item) { return <li>{this.prefix + item}</li> }, { prefix: '>' })}</ul></Hydrate>
}
`,
      )
      expect(await renderChunk(chunks[0]!, { items: ['a', 'b'] })).toBe(
        '<ul><li>>a</li><li>>b</li></ul>',
      )
    },
  )

  // Qwik: example_use_optimization (use* calls inside the extracted scope)
  // Bug: hook calls are only detected when the callee is a bare identifier, so
  // `React.useId()` in the children is moved into the chunk component instead
  // of being rejected. Impact: the hook runs in a different component on the
  // client than on the server (e.g. `useId` returns a different id, so
  // hydration mismatches). Remove `.fails` once fixed.
  test.fails(
    'client: a hook called through a namespace in the children is rejected',
    async () => {
      await expect(
        compileHydrate(
          'client',
          `import * as React from 'react'
import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p id={React.useId()}>x</p></Hydrate>
}
`,
        ),
      ).rejects.toThrow(/hook/i)
    },
  )
})
