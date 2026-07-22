import { describe, expect, test } from 'vitest'
import {
  normalizeServerFnBase,
  startClientCompilerVite,
} from '../src/vite/client-compiler-plugin'
import type { Plugin } from 'vite'

async function compileServerFn(serverFnMode: 'dev' | 'build') {
  const plugins = startClientCompilerVite({
    framework: 'react',
    serverFnBase: 'http://127.0.0.1:3000/_serverFn/',
    serverFnMode,
  })
  const compilerPlugins = plugins[1] as Array<Plugin>
  const compilerPlugin = compilerPlugins.find(
    (plugin) => plugin.name === 'tanstack-start-core::server-fn:client',
  )!
  const root = '/fixture'
  const id = `${root}/src/server.ts`

  ;(
    compilerPlugin.configResolved as (config: {
      root: string
      experimental: Record<string, unknown>
    }) => void
  )({ root, experimental: {} })

  const transform = compilerPlugin.transform as {
    handler: (code: string, id: string) => Promise<{ code: string }>
  }
  const result = await transform.handler.call(
    {
      environment: { name: 'client', mode: 'build' },
      resolve: async () => null,
      load: async () => null,
      error(message: string): never {
        throw new Error(message)
      },
      warn() {},
    },
    `
      import { createServerFn } from '@tanstack/react-start'
      export const greeting = createServerFn().handler(() => 'hello')
    `,
    id,
  )

  return result.code.match(/createClientRpc\("([^"]+)"\)/)?.[1]
}

describe('standalone client compiler', () => {
  test.each([
    ['https://api.example.com/_serverFn', 'https://api.example.com/_serverFn/'],
    [
      'http://10.0.2.2:3000/app/_serverFn/',
      'http://10.0.2.2:3000/app/_serverFn/',
    ],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeServerFnBase(input)).toBe(expected)
  })

  test.each([
    '',
    '/_serverFn/',
    'file:///tmp/_serverFn/',
    'https://api.example.com/_serverFn/?token=secret',
  ])('rejects invalid server function base %s', (input) => {
    expect(() => normalizeServerFnBase(input)).toThrow()
  })

  test('injects the same endpoint for process.env and import.meta.env', () => {
    const plugins = startClientCompilerVite({
      framework: 'react',
      serverFnBase: 'https://api.example.com/_serverFn',
    })
    const configPlugin = plugins[0]

    expect(configPlugin).toMatchObject({
      name: 'tanstack-start-core:standalone-client-config',
    })
    const config = (configPlugin as any).config()
    expect(config.define).toEqual({
      'process.env.TSS_SERVER_FN_BASE': '"https://api.example.com/_serverFn/"',
      'import.meta.env.TSS_SERVER_FN_BASE':
        '"https://api.example.com/_serverFn/"',
    })
  })

  test('emits dev IDs from a standalone Vite build environment', async () => {
    const functionId = await compileServerFn('dev')
    const decoded = JSON.parse(
      Buffer.from(functionId!, 'base64url').toString('utf8'),
    )

    expect(decoded).toEqual({
      file: '/src/server.ts?tss-serverfn-split',
      export: 'greeting_createServerFn_handler',
    })
  })

  test('keeps deterministic hash IDs for deployment builds', async () => {
    const functionId = await compileServerFn('build')

    expect(functionId).toMatch(/^[a-f0-9]{64}$/)
  })
})
