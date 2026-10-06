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
  /** Compile the server-function provider module (`?tss-serverfn-split`). */
  provider?: boolean
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
    id: `/test/src/module.tsx${options.provider ? '?tss-serverfn-split' : ''}`,
    detectedKinds: detectKindsInCode(code, env),
  })
  return result?.code ?? null
}

/**
 * Oxc (Vite 8's JSX transform) only reads JSX pragmas from the comments that
 * lead the file, so statements the Start compiler inserts must not land above
 * the pragma. `main` inserts them above it too.
 */
async function jsxRuntimeOf(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return result.code.match(/from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/)?.[1]
}

const serverFnCard = `/** @jsxImportSource @emotion/react */
import { createServerFn } from '@tanstack/react-start'

export const getGreeting = createServerFn().handler(async () => (
  <b css={{ color: 'hotpink' }}>hi</b>
))

export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}
`

test.each([
  { env: 'client', provider: false },
  { env: 'server', provider: false },
  { env: 'server', provider: true },
] as const)(
  '$env (provider: $provider): inserted server function imports stay below the @jsxImportSource pragma',
  async ({ env, provider }) => {
    const output = await compileStartModule({
      env,
      provider,
      code: serverFnCard,
    })

    expect(output).not.toBeNull()
    expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
  },
)

test('client: inserted Hydrate chunk loaders stay below the @jsxImportSource pragma', async () => {
  const output = await compileStartModule({
    env: 'client',
    code: `/** @jsxImportSource @emotion/react */
import { Hydrate } from '@tanstack/react-start'
import { Widget } from './widget'

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
  expect(await jsxRuntimeOf(output!)).toBe('@emotion/react/jsx-runtime')
})
