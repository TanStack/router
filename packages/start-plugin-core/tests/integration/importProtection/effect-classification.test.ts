/**
 * Whether a dead re-export of a denied module is reported depends on whether
 * evaluating the module has effects. What the bundler would keep decides: the
 * size of the module's graph, a platform builtin or the framework's runtime it
 * imports do not make it effectful. An effect at the end of a long chain is
 * still one. Start's builder chains (`createServerFn().handler(fn)`,
 * middleware, isomorphic and env-only fns) with pure arguments are no
 * effect, and an argument the environment's compile erases (a handler or a
 * validator on the client, a client implementation on the server) is not
 * evaluated there: with protection off both bundlers drop such a module.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  rejection,
  reportedViolations,
  violationsOf,
} from '../../importProtection/start-apps'
import type { StartBuildError } from '../../build-harness'

const timeout = 60_000

/** A chain of `length` modules; `last` is the code of its last one. */
function chain(length: number, last: string) {
  const files: Record<string, string> = {}
  for (let i = 0; i < length - 1; i++) {
    files[`src/d/m${i}.ts`] =
      `import { c${i + 1} } from './m${i + 1}'\nexport const c${i} = () => c${i + 1}()\n`
  }
  files[`src/d/m${length - 1}.ts`] = last
  return files
}

const deadBarrel = (target: Record<string, string>) => ({
  ...target,
  'src/barrel.ts': `export { secret } from './s.server'
export const safe = () => 'MARK_SAFE'
`,
  'src/entry.ts': `export { safe } from './barrel'\n`,
})

const pureEnd = `export const c299 = () => 1\n`
const throughChain = `import { c0 } from './d/m0'
export const secret = () => c0() + 'MARK_SECRET'
`

const START = `import { createClientOnlyFn, createIsomorphicFn, createMiddleware, createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { track } from './track'
import { z } from './z'
`

/**
 * Modules of Start builder chains denied in one environment (`*.server.ts`
 * on the client, `*.client.ts` on the server), by name: `dead` ones only a
 * dead re-export of `src/barrel.ts` reaches (`builders`: pure in the
 * environment that denies them; `effects`: not), `live` ones the entry
 * imports. `track()` and `z.object()` are calls of imported functions:
 * effects wherever they run.
 */
const builders = {
  // a server fn (E1), with a method and a middleware, an isomorphic fn and a
  // server-only fn
  e1: `export const fn = createServerFn().handler(async () => 'MARK_SECRET')\n`,
  middleware: `const mw = createMiddleware().server(({ next }) => next())
export const fn = createServerFn({ method: 'POST' }).middleware([mw]).handler(async () => 'MARK_SECRET')\n`,
  isomorphic: `export const iso = createIsomorphicFn().server(() => 'MARK_SECRET').client(() => 'c')
export const so = createServerOnlyFn(() => 'MARK_SECRET')\n`,
  // what the client compile erases: validators, handlers, server
  // implementations (a schema built by a call, the common case)
  validator: `export const fn = createServerFn().validator(z.object({ id: z.string() })).handler(async () => 'MARK_SECRET')
export const mw = createMiddleware({ type: 'function' }).validator(z.object({})).server(track()).client(async ({ next }) => next())\n`,
  handlerCall: `const make = () => { track(); return async () => 'MARK_SECRET' }
export const fn = createServerFn().handler(make())
export const so = createServerOnlyFn(track())\n`,
  // what only an erased argument reads: an effectful module only the
  // handler uses, a schema const only the validator reads
  dbHandler: `import { db } from './db'
export const fn = createServerFn().handler(async () => db.query)
export const so = createServerOnlyFn(() => db.query)\n`,
  schemaConst: `const Input = z.object({ id: z.string() })
export const fn = createServerFn().validator(Input).handler(async () => 'MARK_SECRET')\n`,
  // denied by its marker, not its name
  'fns.marked': `import '@tanstack/react-start/server-only'
export const fn = createServerFn().handler(async () => 'MARK_SECRET')\n`,
  // a builder stored in a const and extended, a default export
  stored: `const authed = createServerFn({ method: 'POST' }).middleware([createMiddleware().server(({ next }) => next())])
export const a = authed.handler(async () => 'MARK_SECRET')
export const b = authed.validator(z.object({})).handler(async () => 'MARK_SECRET')
export default createServerFn().handler(async () => 'MARK_SECRET')\n`,
  // on the server: a client implementation and a client-only fn
  'iso.client': `export const iso = createIsomorphicFn().server(() => 's').client(track())
export const co = createClientOnlyFn(track())\n`,
}
const effects = {
  // a real effect next to a server fn (P4), an unknown method (P7), an
  // argument the client keeps, top-level await (an async module delays its
  // importers' evaluation)
  realEffect: `;(globalThis as Record<string, unknown>).fx = 1
export const fn = createServerFn().handler(async () => 'MARK_SECRET')\n`,
  unknownMethod: `export const fn = (createServerFn() as any).unknownThing(() => 1)\n`,
  keptArgument: `export const fn = createServerFn().middleware([track()]).handler(async () => 'MARK_SECRET')\n`,
  topLevelAwait: `const conn = await Promise.resolve('db')
export const fn = createServerFn().handler(async () => conn)\n`,
  // the effectful module is also read by code the client keeps
  dbKept: `import { db } from './db'
export const label = () => String(db)
export const fn = createServerFn().handler(async () => db.query)\n`,
  // on the server: a server implementation built by a call, a real effect
  'srv.client': `export const iso = createIsomorphicFn().server(track()).client(() => 'c')\n`,
  'fx.client': `;(globalThis as Record<string, unknown>).fx = 1
export const co = createClientOnlyFn(() => 1)\n`,
}

/** The file of a module of `builders` or `effects` (a `.server` module unless its name has a suffix). */
const fileOf = (name: string) =>
  name.includes('.') ? `src/${name}.ts` : `src/${name}.server.ts`

/** The names a module of `builders` or `effects` exports. */
const exportNames = (code: string) => [
  ...[...code.matchAll(/export const (\w+)/g)].map((m) => m[1]!),
  ...(code.includes('export default') ? ['default'] : []),
]

/** An app whose entry imports `safe` of a barrel re-exporting every module of `dead` (and `live`, used). */
function builderApp(
  dead: Record<string, string>,
  live: Array<string> = [],
): Record<string, string> {
  const files: Record<string, string> = {
    'src/track.ts': `export const track = () => () => 1\n`,
    'src/db.ts': `import { track } from './track'\nexport const db = { query: track() }\n`,
    'src/z.ts': `export const z = { object: (shape: object) => shape, string: () => 'string' }\n`,
    'src/barrel.ts': `${Object.entries(dead)
      .map(
        ([name, code], i) =>
          `export { ${exportNames(code)
            .map((n) => `${n} as m${i}_${n}`)
            .join(', ')} } from './${fileOf(name).slice(4, -3)}'\n`,
      )
      .join('')}export const safe = () => 'MARK_SAFE'\n`,
    'src/entry.ts': `export { safe } from './barrel'
${live.map((name, i) => `import * as l${i} from './${fileOf(name).slice(4, -3)}'\nexport const live${i} = () => String(l${i})\n`).join('')}`,
  }
  for (const [name, code] of Object.entries(dead)) {
    files[fileOf(name)] = START + code
  }
  return files
}

/** `<environment> <denied file>` of each violation a build reported, distinct, sorted. */
const reportedTargets = (error: StartBuildError) =>
  [
    ...new Set(
      violationsOf(error).map(
        ({ environment, resolved }) => `${environment} ${resolved}`,
      ),
    ),
  ].sort()

describe.each(startBundlers)('%s build', (bundler) => {
  // Every builder module reached by a dead re-export only is left out
  // unreported in the environment that denies it; the server still reports
  // its true ones (the client build passed, or it would have failed first).
  test(
    'a dead re-export of a module of Start builder chains is reported only when the module has an effect in the environment that denies it',
    async () => {
      const server = Object.fromEntries(
        Object.entries(effects).filter(([name]) => name.endsWith('.client')),
      )
      const error = await rejection(
        buildStart({
          bundler,
          files: builderApp({ ...builders, ...server }),
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedTargets(error)).toEqual(
        Object.keys(server)
          .map((name) => `server ${fileOf(name)}`)
          .sort(),
      )
    },
    timeout,
  )

  test(
    'a dead re-export of a module with a builder chain and an effect, and a live import of one, are reported on the client',
    async () => {
      const client = Object.fromEntries(
        Object.entries(effects).filter(([name]) => !name.endsWith('.client')),
      )
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...builderApp(client, ['live']),
            [fileOf('live')]:
              `${START}export const fn = createServerFn().handler(async () => 'MARK_SECRET')\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedTargets(error)).toEqual(
        [...Object.keys(client), 'live']
          .map((name) => `client ${fileOf(name)}`)
          .sort(),
      )
    },
    timeout,
  )

  test.each([
    {
      name: 'a pure graph of 300 modules',
      target: {
        ...chain(300, pureEnd),
        'src/s.server.ts': throughChain,
      },
    },
    {
      name: 'a builtin',
      target: {
        'src/s.server.ts': `import { readFileSync } from 'node:fs'
export const secret = () => readFileSync('x') + 'MARK_SECRET'
`,
      },
    },
    {
      name: "the framework's server runtime",
      target: {
        'src/s.server.ts': `import { getRequest } from '@tanstack/react-start/server'
export const secret = () => String(getRequest) + 'MARK_SECRET'
`,
      },
    },
  ])(
    'a dead re-export of a denied module importing $name is not reported',
    async ({ target }) => {
      const { client, violations } = await buildStart({
        bundler,
        files: deadBarrel(target),
        entry: 'src/entry.ts',
      })
      expect(violations).toEqual([])
      expect(client.where('MARK_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'a bare import of a denied module whose only effect is an external URL is reported',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/s.server.ts': `import 'https://cdn.example.com/x.js'\nexport {}\n`,
            'src/entry.ts': `import './s.server'\nexport const read = () => 1\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )

  test(
    'an unused import of a denied module with an effect at the end of 300 modules is reported',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...chain(
              300,
              `;(globalThis as Record<string, unknown>).fx = 1\nexport const c299 = () => 1\n`,
            ),
            'src/s.server.ts': throughChain,
            'src/mid.js': `import { secret } from './s.server'
export const safe = () => 'MARK_SAFE'
`,
            'src/entry.ts': `export { safe } from './mid.js'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
    },
    timeout,
  )
})
