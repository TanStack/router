import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileCode, compileHydrate, outputs } from './regression-helpers'

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
  async ({ output, code }) => {
    const compiled = await compileCode(output, code)
    expect(await jsxRuntimeOf(compiled!)).toBe('@emotion/react/jsx-runtime')
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
// Bug: the server fn runtime import (RPC or `createServerRpc`) is inserted
// above the pragma comment that leads the file.
// Impact: with Vite 8, a module with a server fn compiles its JSX with the
// default runtime: `css` props (Emotion) are ignored.
// Source: #8504 start-compiler-jsx-pragma.test.ts (red on main); same root
// cause as the code splitter's pragma pin
// (router-plugin/tests/code-splitter-pragmas.test.ts).
test.fails.each(outputs)(
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

const hydrateParent = (
  imports: string,
) => `/** @jsxImportSource @emotion/react */
${imports}
export function Card() {
  return (
    <div css={{ color: 'hotpink' }}>
      <Hydrate>
        <Widget />
      </Hydrate>
    </div>
  )
}`
// The effective runtime decision is what counts (SPEC J2.16, D-04), read
// through Oxc, Vite 8's JSX transform; whether the comment text survives is
// free (FIX-PLAN S30).
const hydrateParentImports = [
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
]

// Bug: the parent's Hydrate chunk loaders are inserted above the pragma
// comment that leads the file.
// Impact: with Vite 8 (Oxc only reads pragmas that lead the file), the
// parent compiles its JSX with the default runtime: `css` props are ignored.
// Source: #8504 start-compiler-jsx-pragma.test.ts (red on main); same root
// cause as the server fn pin above.
test.fails.each(hydrateParentImports)(
  'client: the parent keeps selecting the pragma JSX runtime when the import it sits on $name',
  async ({ imports }) => {
    const parent = await compileCode('client', hydrateParent(imports), {
      compilerPlugins: [createHydrateCompilerPlugin()],
    })
    expect(await jsxRuntimeOf(parent!)).toBe('@emotion/react/jsx-runtime')
  },
)
