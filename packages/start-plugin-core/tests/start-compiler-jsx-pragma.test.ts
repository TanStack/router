import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileStartModule } from './compile-start-module'

/**
 * A file-level JSX pragma decides which JSX runtime the bundler's own JSX
 * transform uses for the module. The Start compiler runs before that
 * transform (`enforce: 'pre'`), so it must not drop the pragma when it removes
 * the import statement the comment sits on.
 */
async function jsxRuntimeOf(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return result.code.match(/from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/)?.[1]
}

const isomorphic = `/** @jsxImportSource @emotion/react */
import { createIsomorphicFn } from '@tanstack/react-start'

const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export function Card() {
  return <div css={{ color: 'hotpink' }}>{where()}</div>
}
`

test.each(['client', 'server'] as const)(
  '%s: compiling createIsomorphicFn keeps the file-level @jsxImportSource pragma',
  async (env) => {
    const output = await compileStartModule({ env, code: isomorphic })

    expect(output).not.toBeNull()
    expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
  },
)

test('client: stripping a middleware .server() keeps the file-level @jsxImportSource pragma', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `/** @jsxImportSource @emotion/react */
import { verifySession } from './session'
import { createMiddleware } from '@tanstack/react-start'

export const auth = createMiddleware().server(async ({ next }) => {
  await verifySession()
  return next()
})

export function Badge() {
  return <span css={{ color: 'hotpink' }}>signed in</span>
}
`,
  })

  expect(output).not.toBeNull()
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})

test('server: stripping <ClientOnly> children keeps the file-level @jsxImportSource pragma', async () => {
  const output = await compileStartModule({
    env: 'server',
    code: `/** @jsxImportSource @emotion/react */
import { Chart } from './chart'
import { ClientOnly } from '@tanstack/react-router'

export function Dashboard() {
  return (
    <section css={{ padding: 8 }}>
      <ClientOnly fallback={<p>Loading</p>}>
        <Chart />
      </ClientOnly>
    </section>
  )
}
`,
  })

  expect(output).not.toBeNull()
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})

test('client: createServerOnlyFn keeps a classic @jsx pragma', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `/** @jsxRuntime classic */
/** @jsx h */
import { createServerOnlyFn } from '@tanstack/react-start'
import { h } from 'preact'

const readSecret = createServerOnlyFn(() => process.env.SECRET)

export function Panel() {
  return <p onClick={() => readSecret()}>panel</p>
}
`,
  })

  expect(output).not.toBeNull()
  const { code } = await transformWithOxc(output!, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  expect(code).toMatch(/\bh\("p"/)
})

test('client: moving Hydrate children into a chunk keeps the pragma for esbuild-style consumers', async () => {
  // Vite 7 and earlier transform JSX with esbuild, which honours the pragma
  // wherever it appears; check the comment itself survives.
  const output = await compileStartModule({
    env: 'client',
    code: `/** @jsxImportSource @emotion/react */
import { Widget } from './widget'
import { Hydrate } from '@tanstack/react-start'

export function Card() {
  return (
    <div css={{ color: 'hotpink' }}>
      <Hydrate when="idle">
        <Widget />
      </Hydrate>
    </div>
  )
}
`,
    compilerPlugins: [createHydrateCompilerPlugin()],
  })

  expect(output).not.toBeNull()
  expect(output).toContain('@jsxImportSource @emotion/react')
})
