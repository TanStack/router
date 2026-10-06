import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import type { StartCompilerPlugin } from '../src/types'

async function compileStartModule(options: {
  env: 'client' | 'server'
  code: string
  compilerPlugins?: Array<StartCompilerPlugin>
}) {
  const { env, code } = options
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
    code,
    id: '/test/src/module.tsx',
    detectedKinds: detectKindsInCode(code, env),
  })
  return result?.code ?? null
}

/** The JSX runtime Oxc (Vite 8's JSX transform) selects for compiled output. */
async function jsxRuntimeOf(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return result.code.match(/from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/)?.[1]
}

test('client: a Hydrate chunk keeps the file-level @jsxImportSource pragma', async () => {
  const plugin = createHydrateCompilerPlugin()
  const parent = await compileStartModule({
    env: 'client',
    code: `/** @jsxImportSource @emotion/react */
import { Hydrate } from '@tanstack/react-start'

export function Card() {
  return (
    <Hydrate when="idle">
      <div css={{ color: 'hotpink' }}>card</div>
    </Hydrate>
  )
}
`,
    compilerPlugins: [plugin],
  })
  const id = parent?.match(/import\("([^"]+)"\)/)?.[1]
  expect(id).toBeDefined()
  const chunk = plugin.loadVirtualModule?.({
    id: id!,
    root: '/test',
    env: 'client',
    envName: 'client',
  })

  expect(chunk).toBeTruthy()
  expect(await jsxRuntimeOf(chunk!.code)).toBe('@emotion/react/jsx-runtime')
})

test('server: a line-comment @jsxImportSource pragma survives a stripped client-only fn', async () => {
  const output = await compileStartModule({
    env: 'server',
    code: `// @jsxImportSource @emotion/react
import { createClientOnlyFn } from '@tanstack/react-start'

const track = createClientOnlyFn(() => window.alert('hi'))

export function Button() {
  return <button css={{ color: 'hotpink' }} onClick={() => track()} />
}
`,
  })

  expect(output).not.toBeNull()
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})

test('client: a pragma inside a file header comment survives a stripped server-only fn', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `/**
 * Copyright Example Corp.
 * @jsxImportSource @emotion/react
 */
import { createServerOnlyFn } from '@tanstack/react-start'

const readSecret = createServerOnlyFn(() => process.env.SECRET)

export function Panel() {
  return <p css={{ color: 'hotpink' }} onClick={() => readSecret()} />
}
`,
  })

  expect(output).not.toBeNull()
  expect(output).toContain('Copyright Example Corp.')
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})

test('client: classic @jsx and @jsxFrag pragmas survive a stripped isomorphic fn', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `/** @jsxRuntime classic */
// @jsx h
// @jsxFrag Fragment
import { createIsomorphicFn } from '@tanstack/react-start'
import { h, Fragment } from 'preact'

const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export function List() {
  return <>{where()}</>
}
`,
  })

  expect(output).not.toBeNull()
  const { code } = await transformWithOxc(output!, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  expect(code).toMatch(/\bh\(Fragment\b/)
})

test('client: a pragma after a directive stays ahead of inserted server function imports', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `'use client'
/** @jsxImportSource @emotion/react */
import { createServerFn } from '@tanstack/react-start'

export const getGreeting = createServerFn().handler(async () => 'hi')

export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}
`,
  })

  expect(output).not.toBeNull()
  expect(output!.match(/@jsxImportSource/g)).toHaveLength(1)
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})
