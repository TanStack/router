import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import type { StartCompilerPlugin } from '../src/types'

// Inputs adapted from the React Compiler fixture corpus
// (facebook/react, compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT).

/** Compiles one module through `StartCompiler` like the bundler plugins do. */
async function compileStartModule(options: {
  env: 'client' | 'server'
  code: string
  compilerPlugins?: Array<StartCompilerPlugin>
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
    compilerPlugins: options.compilerPlugins,
  })
  const result = await compiler.compile({
    code: options.code,
    id: '/test/src/module.tsx',
    detectedKinds: detectKindsInCode(options.code, env),
  })
  return result?.code ?? null
}

/** Compiles a module with one `<Hydrate>` boundary and loads its client chunk. */
async function compileHydrateChunk(code: string) {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env: 'client',
    code,
    compilerPlugins: [plugin],
  })
  const ids = [...(parent ?? '').matchAll(/import\((["'])(.+?)\1\)/g)]
  expect(ids).toHaveLength(1)
  const chunk = plugin.loadVirtualModule?.({
    id: ids[0]![2]!,
    root: '/test',
    env: 'client',
    envName: 'client',
  })
  if (!chunk) {
    throw new Error('expected the Hydrate chunk to load')
  }
  return chunk.code
}

/**
 * Evaluates a self-contained chunk (no imports) like a bundler would and
 * renders its `H0` export: JSX becomes plain function calls and intrinsic
 * elements become tags.
 */
async function renderChunk(chunk: string) {
  const { code } = await transformWithOxc(chunk, 'chunk.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  const module: Record<string, (props: unknown) => string> = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + code)}`
  )
  return module.H0!({ props: {} })
}

describe('Hydrate chunks declare every module binding the split children use', () => {
  test.each([
    {
      // jsx-underscore-prefix-component.js
      name: 'a component whose name starts with an underscore',
      body: `const _Bar = (props) => <b>{props.value}</b>
function Widget() {
  return <_Bar value="bar" />
}`,
      expected: '<b>bar</b>',
    },
    {
      // jsx-member-expression.js
      name: 'a JSX member tag on a module object',
      body: `const ui = { Badge: (props) => <b>{props.label}</b> }
function Widget() {
  return <ui.Badge label="ok" />
}`,
      expected: '<b>ok</b>',
    },
    {
      // effect-derived-computations/derived-state-from-default-props.js
      name: 'a default-exported component',
      body: `export default function Widget() {
  return <p>default</p>
}`,
      expected: '<p>default</p>',
    },
    {
      // should-bailout-without-compilation-annotation-mode.js
      name: 'a module let only written by the child',
      body: `let someGlobal = 'joe'
function Widget() {
  someGlobal = 'wat'
  return <p>written</p>
}`,
      expected: '<p>written</p>',
    },
  ])('client: $name', async ({ body, expected }) => {
    const chunk =
      await compileHydrateChunk(`import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
${body}
export function Page() {
  return (
    <Hydrate when={visible()}>
      <Widget />
    </Hydrate>
  )
}
`)
    expect(await renderChunk(chunk)).toBe(expected)
  })
})
