/**
 * Server fn ids of production builds are deterministic for an unchanged
 * project (SPEC J4.4, G4): the same app at the same root, built again with
 * its files written in another order, gives every server fn the same public
 * `url`, and each one reaches its own handler. Observed through the public
 * Start host in production mode (`createStartHost({ ...hostDefaults, serve: false })`: real
 * `vite build` and Start's preview server; the client in the hydrated
 * production page, calling the server through the built server entry).
 * The projection compared is the `url` of each server fn and what calling
 * it gives (`@tanstack/compiler-test-utils/determinism`), never bytes or
 * generated names.
 * Moved from the unit test start-compiler-determinism.test.ts ("are
 * deterministic for an unchanged project, whatever order its modules are
 * compiled in"), which compiled through the internal compiler.
 */
import { writeFile } from 'node:fs/promises'
import { afterAll, expect, test } from 'vitest'
import {
  expectDeterministic,
  reorderedRecords,
} from '@tanstack/compiler-test-utils/determinism'
import { callFromClient, createStartHost, inPage } from '../regression-helpers'
import type { StartCase, StartHost } from '../regression-helpers'

/**
 * The host defaults of the B2 lead's branch (until it is merged): no import
 * protection (its dev mock would hide a leaked server import from the
 * client's loads) and an app tsconfig with `verbatimModuleSyntax` (without
 * it, Vite's TypeScript transform drops unreferenced imports after the
 * compiler and hides leaks).
 */
const hostTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    verbatimModuleSyntax: true,
  },
}
const hostDefaults = {
  start: { importProtection: { enabled: false } },
  files: { 'tsconfig.json': JSON.stringify(hostTsconfig) },
}

const serverFnModule = (name: string, value: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => '${value}')
`

/** Three server fn modules, two of the same base name and export name. */
const modules = {
  'a.ts': serverFnModule('a', 'from a'),
  'b.ts': serverFnModule('b', 'from b'),
  'c/a.ts': serverFnModule('a', 'from c/a'),
}
/** The module the page loads: it gives the three server fns. */
const index = `export { a } from './a'
export { b } from './b'
export { a as nestedA } from './c/a'
`

let host: StartHost | undefined
afterAll(() => host?.close())

/** Each server fn's `url` and what a call from the client gives. */
async function observe(startCase: StartCase) {
  const urls = await inPage<Record<string, string>>(
    startCase,
    `return { a: module.a.url, b: module.b.url, nestedA: module.nestedA.url }`,
    { file: 'index.ts' },
  )
  const called: Record<string, unknown> = {}
  for (const name of ['a', 'b', 'nestedA']) {
    called[name] = await callFromClient(
      startCase,
      `module.${name}`,
      undefined,
      {
        file: 'index.ts',
      },
    )
  }
  return { urls, called }
}

test('are deterministic for an unchanged project, whatever order its files are written in', async () => {
  host = await createStartHost({ ...hostDefaults, serve: false })
  let startCase: StartCase | undefined
  const observations = await expectDeterministic(
    reorderedRecords(modules),
    async ({ record }) => {
      if (!startCase) {
        startCase = await host!.case({ ...record, 'index.ts': index })
        await host!.preview()
      } else {
        for (const [file, code] of Object.entries(record)) {
          await writeFile(startCase.file(file), code)
        }
        await host!.preview({ rebuild: true })
      }
      return observe(startCase)
    },
  )
  // Each build: three ids, each reaching its own handler.
  const [first] = observations
  expect(new Set(Object.values(first!.urls)).size).toBe(3)
  expect(first!.called).toEqual({
    a: 'from a',
    b: 'from b',
    nestedA: 'from c/a',
  })
}, 60_000)
