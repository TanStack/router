/**
 * Environment-specific functions in a production build (SPEC J4.9, J4.10,
 * J4.12): each environment keeps the implementation of its own environment
 * and only the modules that implementation reads, and the other one throws.
 * The production twin of the dev row of start-compiler-factories.test.ts
 * ("dev and build compile alike"), through the
 * public Start host in production mode (`createStartHost({ serve: false })`:
 * real `vite build`, Start's preview server, the hydrated production page).
 * Source: Waku vite-plugin-allow-server.test.ts "keeps only allowServer
 * dependencies and removes allowServer imports", "supports allowServer
 * aliasing and export specifiers".
 */
import { afterAll, expect, test } from 'vitest'
import {
  createStartHost,
  fromPage,
  inPage,
  settle,
  throwsError,
} from '../regression-helpers'
import type { PageSettled, StartHost } from '../regression-helpers'

/**
 * The host defaults these tests use: no import
 * protection and an app tsconfig with `verbatimModuleSyntax`.
 */
const hostDefaults = {
  start: { importProtection: { enabled: false } },
  files: {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        verbatimModuleSyntax: true,
      },
    }),
  },
}

let host: StartHost | undefined
afterAll(() => host?.close())

test('build: each environment keeps the implementation of its environment and only its dependencies', async () => {
  host = await createStartHost({ ...hostDefaults, serve: false })
  const startCase = await host.case({
    'module.tsx': `import { createServerOnlyFn, createClientOnlyFn as clientOnly } from '@tanstack/react-start'
import { draw } from './chart.client'
import { query } from './db.server'
const shared = 1
const readDb = () => query(shared)
const serverValue = createServerOnlyFn(readDb)
export const clientValue = clientOnly(() => draw(shared))
export { serverValue as exposed }`,
    'chart.client.ts': `export const draw = (x: number) => 'MARK_DRAW:' + x\n`,
    'db.server.ts': `export const query = (x: number) => 'MARK_QUERY:' + x\n`,
  })
  const { build } = await host.preview()
  // Only its dependencies: the chunks the module is in, the chunks they
  // import lazily, and every chunk those import statically ship nothing of
  // the other environment's module. (Every case file is a lazy chunk of its
  // own in this app, as the page imports each one through a glob: the lazy
  // imports of shared chunks do not count.)
  const code = (environment: string) => {
    const { chunks } = build.environments[environment]!
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
    const module = startCase.file('module.tsx')
    const own = chunks.filter((chunk) => chunk.moduleIds.includes(module))
    expect(own.length, `${environment} chunks of the module`).toBeGreaterThan(0)
    const reached = new Set([
      ...own,
      ...own.flatMap((chunk) =>
        chunk.dynamicImports.flatMap((name) => byName.get(name) ?? []),
      ),
    ])
    for (const chunk of reached) {
      for (const name of chunk.imports) {
        const next = byName.get(name)
        if (next) {
          reached.add(next)
        }
      }
    }
    return [...reached].map((chunk) => chunk.code).join('\n')
  }
  expect(code('client')).not.toContain('MARK_QUERY')
  expect(code('ssr')).not.toContain('MARK_DRAW')
  // The client (the production page) runs the client implementation; the
  // server-only fn throws.
  expect(await inPage(startCase, 'return module.clientValue()')).toBe(
    'MARK_DRAW:1',
  )
  expect(
    fromPage(
      await inPage<PageSettled>(startCase, 'return settle(module.exposed)'),
    ),
  ).toEqual(throwsError)
  // The server build runs the server implementation; the client-only fn
  // throws.
  const ssr = await startCase.ssr()
  expect([settle(ssr.clientValue), ssr.exposed()]).toEqual([
    throwsError,
    'MARK_QUERY:1',
  ])
}, 60_000)
