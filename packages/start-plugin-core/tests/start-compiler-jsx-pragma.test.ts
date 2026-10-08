import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  compileCode,
  compileHydrate,
  evaluateHydrateParent,
  evaluateModule,
  getChunkComponent,
  hydrateParentStubs,
  outputs,
} from './regression-helpers'

/**
 * A file-level JSX pragma decides which JSX runtime the bundler's own JSX
 * transform uses for the module. The Start compiler runs before that
 * transform (`enforce: 'pre'`), so it must not drop the pragma when it removes
 * the import statement the comment sits on.
 */
async function transformJsx(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return result.code
}

/** The JSX runtime Oxc (Vite 8's JSX transform) selects for compiled output. */
async function jsxRuntimeOf(code: string) {
  return (await transformJsx(code)).match(
    /from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/,
  )?.[1]
}

// Each comment form sits on the import of a factory the compiler removes; the
// factory and output only vary to show any removed import qualifies.
test.each([
  {
    name: 'a block comment',
    output: 'client',
    kept: '@jsxImportSource @emotion/react',
    code: `/** @jsxImportSource @emotion/react */
import { createIsomorphicFn } from '@tanstack/react-start'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function Card() {
  return <div css={{ color: 'hotpink' }}>{where()}</div>
}`,
  },
  {
    name: 'a line comment',
    output: 'ssr',
    kept: '@jsxImportSource @emotion/react',
    code: `// @jsxImportSource @emotion/react
import { createClientOnlyFn } from '@tanstack/react-start'
const track = createClientOnlyFn(() => window.alert('tracked'))
export function Button() {
  return <button css={{ color: 'hotpink' }} onClick={() => track()} />
}`,
  },
  {
    name: 'a file header comment',
    output: 'client',
    kept: 'Copyright Example Corp.',
    code: `/**
 * Copyright Example Corp.
 * @jsxImportSource @emotion/react
 */
import { createServerOnlyFn } from '@tanstack/react-start'
const readSecret = createServerOnlyFn(() => process.env.SECRET)
export function Panel() {
  return <p css={{ color: 'hotpink' }} onClick={() => readSecret()} />
}`,
  },
] as const)(
  '$output: a @jsxImportSource pragma in $name survives the removal of the import it sits on',
  async ({ output, code, kept }) => {
    const compiled = await compileCode(output, code)
    expect(await jsxRuntimeOf(compiled!)).toBe('@emotion/react/jsx-runtime')
    expect(compiled).toContain(kept)
  },
)

test('client: classic @jsx and @jsxFrag pragmas survive the removal of the import they sit on', async () => {
  const client = await compileCode(
    'client',
    `/** @jsxRuntime classic */
// @jsx h
// @jsxFrag Fragment
import { createIsomorphicFn } from '@tanstack/react-start'
import { h, Fragment } from 'preact'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function List() {
  return <>{where()}</>
}`,
  )
  expect(await transformJsx(client!)).toMatch(/\bh\(Fragment\b/)
})

// Oxc (Vite 8's JSX transform) only reads JSX pragmas from the comments that
// lead the file, so the imports the compiler inserts must stay below them.
test.each(outputs)(
  '%s: inserted server function imports stay below the @jsxImportSource pragma',
  async (output) => {
    const compiled = await compileCode(
      output,
      `/** @jsxImportSource @emotion/react */
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => (
  <b css={{ color: 'hotpink' }}>hi</b>
))
export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}`,
    )
    expect(await jsxRuntimeOf(compiled!)).toBe('@emotion/react/jsx-runtime')
  },
)

test('client: a pragma after a directive stays ahead of inserted server function imports', async () => {
  const client = await compileCode(
    'client',
    `'use client'
/** @jsxImportSource @emotion/react */
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}`,
  )
  expect(client!.match(/@jsxImportSource/g)).toHaveLength(1)
  expect(await jsxRuntimeOf(client!)).toBe('@emotion/react/jsx-runtime')
})

test('client: a Hydrate chunk keeps the file-level @jsxImportSource pragma', async () => {
  const { chunks } = await compileHydrate(
    'client',
    `/** @jsxImportSource @emotion/react */
import { Hydrate } from '@tanstack/react-start'
export function Card() {
  return (
    <Hydrate>
      <div css={{ color: 'hotpink' }}>card</div>
    </Hydrate>
  )
}`,
  )
  expect(await jsxRuntimeOf(chunks[0]!)).toBe('@emotion/react/jsx-runtime')
})

// Whether the import the pragma sits on moves into the chunk or stays, the
// parent keeps the pragma ahead of the chunk loaders it inserts. Vite 7 and
// earlier transform JSX with esbuild, which honours the pragma wherever it
// appears, so the comment itself must survive too.
test.each([
  {
    name: 'moves into a Hydrate chunk',
    imports: `import { Widget } from './widget'
import { Hydrate } from '@tanstack/react-start'`,
  },
  {
    name: 'stays in the parent',
    imports: `import { Hydrate } from '@tanstack/react-start'
import { Widget } from './widget'`,
  },
])(
  'client: the parent keeps the pragma when the import it sits on $name',
  async ({ imports }) => {
    const parent = await compileCode(
      'client',
      `/** @jsxImportSource @emotion/react */
${imports}
export function Card() {
  return (
    <div css={{ color: 'hotpink' }}>
      <Hydrate>
        <Widget />
      </Hydrate>
    </div>
  )
}`,
      { compilerPlugins: [createHydrateCompilerPlugin()] },
    )
    expect(parent).toContain('@jsxImportSource @emotion/react')
    expect(await jsxRuntimeOf(parent!)).toBe('@emotion/react/jsx-runtime')
  },
)

/** Classic JSX factory: intrinsic elements render as tags, components are called. */
const renderJsx = (type: unknown, props: unknown, ...children: Array<any>) => {
  const text = children
    .flat(Infinity)
    .filter((child) => child != null && child !== false && child !== true)
    .join('')
  if (typeof type === 'function') {
    return type({ ...(props as object), children: text })
  }
  return typeof type === 'string' ? `<${type}>${text}</${type}>` : text
}

// With the classic runtime, JSX compiles to calls of the factories the file's
// pragmas name: their imports stay wherever JSX does, even when the code
// calling them explicitly moves to the server.
test.each([
  {
    name: '@jsx factory',
    pragmas: '/** @jsx h */',
    imports: 'h',
    handler: `h('p', null)`,
    component: '<div>card</div>',
    rendered: '<div>card</div>',
  },
  {
    name: '@jsxFrag factory',
    pragmas: '/** @jsx h */\n/** @jsxFrag Fragment */',
    imports: 'h, Fragment',
    handler: `h(Fragment, null)`,
    component: '<>card</>',
    rendered: 'card',
  },
])(
  'client: the $name stays imported for the JSX left once server functions are compiled',
  async ({ pragmas, imports, handler, component, rendered }) => {
    const client = await compileCode(
      'client',
      `${pragmas}
import { createServerFn } from '@tanstack/react-start'
import { ${imports} } from './jsx'
export const fn = createServerFn().handler(async () => ${handler})
export const Card = () => ${component}`,
    )
    const module = await evaluateModule(client!, {
      './jsx': { h: renderJsx, Fragment: Symbol('Fragment') },
    })
    expect(module.Card()).toBe(rendered)
  },
)

test('client: a Hydrate parent and its chunk keep the @jsx factory their JSX compiles to', async () => {
  const { parent, chunks, plugin } = await compileHydrate(
    'client',
    `/** @jsx h */
import { h } from 'preact'
import { Hydrate, createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => h('p', null))
export function Page() {
  return (
    <main>
      <Hydrate>
        <b>chunk</b>
      </Hydrate>
    </main>
  )
}`,
  )
  let chunkComponent: (props: Record<string, unknown>) => unknown = () => null
  const stubs = {
    ...hydrateParentStubs,
    preact: { h: renderJsx },
    '@tanstack/react-start': {
      ...hydrateParentStubs['@tanstack/react-start'],
      createServerFn: () => ({ handler: () => () => null }),
    },
    '@tanstack/react-router': {
      lazyRouteComponent: () => (props: Record<string, unknown>) =>
        chunkComponent(props),
    },
  }
  const { module, parentModuleStubs } = await evaluateHydrateParent(
    plugin,
    parent,
    stubs,
  )
  chunkComponent = getChunkComponent(
    await evaluateModule(chunks[0]!, {
      ...stubs,
      ...(await parentModuleStubs(chunks[0]!)),
    }),
  )
  expect(module.Page()).toBe('<main>[<b>chunk</b>]</main>')
})
