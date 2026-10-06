import { describe, expect, test } from 'vitest'
import { compileStartModule } from '../compile-start-module'
import { getModuleErrors } from '../validate-module'

/** Compiles the server-function provider module and checks that it is valid. */
async function compileProvider(code: string) {
  const provider = await compileStartModule({
    env: 'server',
    provider: true,
    code,
  })
  return {
    provider,
    errors: provider === null ? [] : await getModuleErrors(provider),
  }
}

describe('createServerFn declared outside the module top level', () => {
  test('keeps the provider module valid for a top-level server fn', async () => {
    const { provider, errors } = await compileProvider(`
import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const top = createServerFn().handler(async () => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`)
    expect(errors).toEqual([])
    expect(provider).toContain('db.top()')
  })

  test('does not emit an invalid provider for an only-nested server fn', async () => {
    const { errors } = await compileProvider(`
import { createServerFn } from '@tanstack/react-start'
export function make() {
  const fn = createServerFn().handler(async () => 1)
  return fn
}`)
    expect(errors).toEqual([])
  })

  test.each([
    {
      name: 'inside a function',
      code: `import { createServerFn } from '@tanstack/react-start'
export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const fn = createServerFn().handler(async () => 1)
      return fn
  }
}`,
    },
    {
      name: 'at the module top level',
      code: `import { createServerFn } from '@tanstack/react-start'
switch (import.meta.env.MODE) {
  case 'a':
    const fn = createServerFn().handler(async () => 1)
    console.log(fn)
}`,
    },
    {
      name: 'next to a top-level server fn',
      code: `import { createServerFn } from '@tanstack/react-start'
export const top = createServerFn().handler(async () => 1)
export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const fn = createServerFn().handler(async () => 2)
      return fn
  }
}`,
    },
  ])(
    'compiles a server fn declared in a switch case $name',
    async ({ code }) => {
      const errors: Record<string, Array<string>> = {}
      for (const [name, options] of [
        ['client', { env: 'client' }],
        ['server caller', { env: 'server' }],
        ['server provider', { env: 'server', provider: true }],
      ] as const) {
        const output = await compileStartModule({ ...options, code })
        errors[name] = output === null ? [] : await getModuleErrors(output)
      }
      expect(errors).toEqual({
        client: [],
        'server caller': [],
        'server provider': [],
      })
    },
  )
})
