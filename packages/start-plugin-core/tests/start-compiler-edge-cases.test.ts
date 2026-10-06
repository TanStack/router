import { describe, expect, test } from 'vitest'
import { createStartCompiler, moduleId } from './regression-helpers'
import { getModuleErrors } from './validate-module'

const providerId = `${moduleId}?tss-serverfn-split`

async function compileValid(
  options: Parameters<typeof createStartCompiler>[0] & {
    code: string
    provider?: boolean
  },
) {
  const { compile, serverFns } = createStartCompiler(options)
  const code = await compile(
    options.code,
    options.provider ? providerId : moduleId,
  )
  expect(code).not.toBeNull()
  expect(await getModuleErrors(code!)).toEqual([])
  return { code: code!, serverFns }
}

function decodeDevId(id: string) {
  return JSON.parse(Buffer.from(id, 'base64url').toString('utf8'))
}

describe('dev mode server functions', () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const getPosts = createServerFn().handler(async () => db.posts())`

  test('client callers use dev ids that encode the provider module and export', async () => {
    const { code: output, serverFns } = await compileValid({
      env: 'client',
      mode: 'dev',
      code,
    })
    const [functionId] = Object.keys(serverFns)
    expect(decodeDevId(functionId!)).toEqual({
      file: '/@id/src/module.tsx?tss-serverfn-split',
      export: 'getPosts_createServerFn_handler',
    })
    expect(output).toContain(`createClientRpc(${JSON.stringify(functionId)})`)
    expect(output).not.toContain('db.server')
  })

  test('the provider module exports the handler and accepts HMR updates', async () => {
    const { code: output } = await compileValid({
      env: 'server',
      mode: 'dev',
      provider: true,
      code,
    })
    expect(output).toMatch(/export\s*\{\s*getPosts_createServerFn_handler\s*\}/)
    expect(output).toMatch(/import\.meta\.hot\.accept\(/)
    expect(output).toMatch(/import\.meta\.webpackHot\.accept\(/)
    expect(output).toContain('db.posts()')
  })

  test('build mode providers do not add HMR handling', async () => {
    const { code: output } = await compileValid({
      env: 'server',
      provider: true,
      code,
    })
    expect(output).not.toContain('import.meta.hot')
  })
})

describe('provider module directives', () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)`

  test('adds each configured directive once, before the generated imports', async () => {
    const { code: output } = await compileValid({
      env: 'server',
      provider: true,
      directives: ['use server', '', 'use server'],
      code: `'use strict'\n${code}`,
    })
    expect(output.match(/["']use server["']/g)).toHaveLength(1)
    expect(output.indexOf('use server')).toBeLessThan(
      output.indexOf('createServerRpc'),
    )
    expect(output).toMatch(/["']use strict["']/)
  })

  // A directive the module already has is covered by
  // `ported-vite-plugin-rsc.test.ts` ("provider module directives").

  test('only provider modules receive directives', async () => {
    const { code: output } = await compileValid({
      env: 'server',
      directives: ['use server'],
      code,
    })
    expect(output).not.toContain('use server')
  })
})

test('redeclared var server functions get distinct versioned handler names', async () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
var fn = createServerFn().handler(async () => 1)
var fn = createServerFn().handler(async () => 2)
export { fn }`
  const client = await compileValid({ env: 'client', code })
  expect(
    Object.values(client.serverFns)
      .map((fn) => fn.functionName)
      .sort(),
  ).toEqual(['fn_createServerFn_handler', 'fn_createServerFn_handler_1'])
  const ids = Object.keys(client.serverFns)
  expect(new Set(ids).size).toBe(2)
  for (const id of ids) {
    expect(client.code).toContain(`createClientRpc(${JSON.stringify(id)})`)
  }

  const provider = await compileValid({ env: 'server', provider: true, code })
  expect(provider.code).toMatch(
    /export\s*\{\s*fn_createServerFn_handler,\s*fn_createServerFn_handler_1\s*\}/,
  )
})

test('provider modules only export the extracted handlers', async () => {
  const { code: output } = await compileValid({
    env: 'server',
    provider: true,
    code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const a = createServerFn().handler(async () => db.a())
const b = createServerFn().handler(async () => db.b())
export { a, b as bee }
export default a
export function helper() { return a }
export * from './other'
export { z } from './z'`,
  })
  expect(output).toMatch(
    /export\s*\{\s*a_createServerFn_handler,\s*b_createServerFn_handler\s*\}/,
  )
  expect(output).not.toMatch(/export\s*\{\s*a,/)
  expect(output).not.toContain('bee')
  expect(output).not.toContain('helper')
  expect(output).not.toContain("'./z'")
  // Statements that are not declarations stay untouched.
  expect(output).toMatch(/export default a\b/)
  expect(output).toMatch(/export \* from ['"]\.\/other['"]/)
})

describe('cross-module factory resolution', () => {
  test('a default-exported middleware builder imported as default', async () => {
    const { code: output } = await compileValid({
      env: 'client',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export default createMiddleware({ type: 'function' })`,
      },
      code: `import mw from './mw'
import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })
export const plain = createMiddleware().server(async ({ next }) => next())`,
    })
    expect(output).toMatch(/export const logged = mw;/)
    expect(output).not.toContain('db.server')
  })

  test('a default-exported server function builder declared by identifier', async () => {
    const { code: output } = await compileValid({
      env: 'client',
      files: {
        '/test/src/builders.ts': `import { createServerFn } from '@tanstack/react-start'
const authed = createServerFn({ method: 'POST' })
export default authed`,
      },
      code: `import authed from './builders'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`,
    })
    expect(output).toMatch(/authed\.handler\(createClientRpc\(/)
    expect(output).not.toContain('db.server')
  })

  test('a namespace import of a local module re-exporting the factories', async () => {
    const files = {
      '/test/src/factories.ts': `export { createServerFn, createServerOnlyFn, createIsomorphicFn } from '@tanstack/react-start'`,
    }
    const code = `import * as F from './factories'
import { db } from './db.server'
export const fn = F.createServerFn().handler(async () => db.x())
export const serverOnly = F.createServerOnlyFn(() => db.z())
export const iso = F.createIsomorphicFn().server(() => db.w()).client(() => 'client')`
    const client = await compileValid({ env: 'client', files, code })
    expect(Object.keys(client.serverFns)).toHaveLength(1)
    expect(client.code).toMatch(
      /F\.createServerFn\(\)\.handler\(createClientRpc\(/,
    )
    expect(client.code).toMatch(/export const iso = \(\) => ["']client["']/)
    expect(client.code).not.toContain('db.server')

    const ssr = await compileValid({ env: 'server', files, code })
    expect(ssr.code).toMatch(/export const serverOnly = \(\) => db\.z\(\)/)
    expect(ssr.code).toMatch(/export const iso = \(\) => db\.w\(\)/)
  })

  test('renamed re-exports next to a type-only export record', async () => {
    const { code: output } = await compileValid({
      env: 'client',
      files: {
        '/test/src/f.ts': `export { createServerFn as csf, createServerOnlyFn as so } from '@tanstack/react-start'
export type { Register } from '@tanstack/react-start'`,
      },
      code: `import { csf, so } from './f'
import { db } from './db.server'
export const fn = csf().handler(async () => db.x())
export const s = so(() => db.y())`,
    })
    expect(output).toMatch(/csf\(\)\.handler\(createClientRpc\(/)
    expect(output).toContain(
      'createServerOnlyFn() functions can only be called on the server!',
    )
    expect(output).not.toContain('db.server')
  })

  test('transforms an aliased re-export of createClientOnlyFn next to createServerOnlyFn on the server', async () => {
    const { code: output } = await compileValid({
      env: 'server',
      files: {
        '/test/src/env.ts': `export { createClientOnlyFn as clientOnly } from '@tanstack/react-start'`,
      },
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { clientOnly } from './env'
import { secret } from './secret.server'
import { readWindow } from './browser'
export const serverValue = createServerOnlyFn(() => secret())
export const clientValue = clientOnly(() => readWindow())`,
    })
    // The client-only implementation (and its browser import) must not reach SSR.
    expect(output).not.toContain('readWindow')
    expect(output).toContain(
      'createClientOnlyFn() functions can only be called on the client!',
    )
  })

  test('a builder reused by several server functions in one module', async () => {
    const { code: output, serverFns } = await compileValid({
      env: 'client',
      files: {
        '/test/src/authed.ts': `import { createServerFn } from '@tanstack/react-start'
const base = createServerFn()
export const authed = base`,
      },
      code: `import { authed } from './authed'
import { db } from './db.server'
export const a = authed.handler(async () => db.a())
export const b = authed.handler(async () => db.b())
export const c = authed.validator((x: string) => x).handler(async () => db.c())`,
    })
    expect(Object.keys(serverFns)).toHaveLength(3)
    expect(output).not.toContain('db.server')
    // validators are removed from client callers
    expect(output).toMatch(
      /export const c = authed\.handler\(createClientRpc\(/,
    )
  })
})

test('a validator without an argument is rejected', async () => {
  const { compile } = createStartCompiler({ env: 'client' })
  await expect(
    compile(`import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`),
  ).rejects.toThrow(
    'createServerFn().validator() must be called with a validator!',
  )
})

test('invalidating a factory module re-resolves its importers', async () => {
  const files: Record<string, string> = {
    '/test/src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
    '/test/src/c.ts': `export * from './b'`,
    '/test/src/d.ts': `import { base } from './c'
export const alias = base`,
  }
  const { compiler, compile } = createStartCompiler({
    env: 'client',
    mode: 'dev',
    files,
  })
  const code = `import { base } from './c'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())`
  const id = '/test/src/a.tsx'

  expect(await compile(code, id)).toMatch(/base\.handler\(createClientRpc\(/)
  compiler.ingestModule({
    code: files['/test/src/d.ts']!,
    id: '/test/src/d.ts',
  })
  expect(
    [...(await compiler.getTransitiveImporters('/test/src/b.ts?v=1'))].sort(),
  ).toEqual(['/test/src/a.tsx', '/test/src/c.ts', '/test/src/d.ts'])

  files['/test/src/b.ts'] =
    `export const base = { handler: (fn: unknown) => fn }`
  expect(compiler.invalidateModule('/test/src/b.ts?v=2')).toBe(true)
  expect(await compile(code, id)).toBeNull()

  files['/test/src/b.ts'] =
    `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn({ method: 'POST' })`
  expect([
    ...compiler.invalidateModules(['/test/src/b.ts', '/test/src/missing.ts']),
  ]).toEqual(['/test/src/b.ts'])
  expect(await compile(code, id)).toMatch(/base\.handler\(createClientRpc\(/)
})
