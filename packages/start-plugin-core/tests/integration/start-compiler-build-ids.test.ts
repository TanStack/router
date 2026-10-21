/**
 * Server fns in production builds (SPEC J4.4 ids, G7 no development code):
 * the build-only rows of the createServerFn suites, run against a real
 * `vite build` of a Start app with the public Start plugin, served by
 * Start's own preview server, its page hydrated in Chromium
 * (`createStartHost({ serve: false })`, `preview()`). Server fns are called
 * from that page (Start's client RPC, by id, through the built server
 * entry) and from server code of the build (inside its real requests).
 *
 * Moved here from createServerFn/createServerFn.test.ts ("dedupes custom
 * ids, the same way across compiler instances"),
 * createServerFn/exports-and-directives.test.ts ("build providers have no
 * dev HMR code", the build row of "ids are repeatable ...", "build ids do
 * not ship source names", the build rows of "a provider for a module ending
 * in a line comment ...").
 *
 * No row for a server fn under a directory whose name contains `#`
 * (formerly createServerFn/declaration-sites.test.ts, "a .ts module in a
 * directory whose name contains # compiles as TypeScript"): Vite's resolver
 * cuts a file path at its first `#` outside `node_modules`, so a plain Vite
 * app without Start cannot serve a module under such a directory in dev,
 * nor build any query import of one (`./c#proj/src/module.ts?raw`:
 * UNRESOLVED_IMPORT), which is how the Start build fails there too
 * (FOLLOWUPS UPSTREAM "`#` in a directory name").
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  callFromClient,
  callServerFnThroughCallers,
  createStartHost,
  inPage,
  serverFnUrls,
} from '../regression-helpers'
import type { StartCase, StartHost, StartPreview } from '../regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const existing = `export const load = createServerFn().handler(async () => 'load')
export const save = createServerFn().handler(async () => 'save')`

/** The cases of the app with Start's default ids. */
interface DefaultCases {
  noHmr: StartCase
  versions: Array<{ startCase: StartCase; names: Array<string> }>
  sourceNames: StartCase
  trailing: Array<{ end: string; startCase: StartCase }>
}

let defaultHost: StartHost | undefined
let defaultPreview: StartPreview
let defaults: DefaultCases
let customHost: StartHost | undefined
let customCase: StartCase

beforeAll(async () => {
  defaultHost = await createStartHost({ serve: false })
  defaults = {
    noHmr: await defaultHost.case({
      'module.tsx': `${head}export const getPosts = createServerFn().handler(async () => 'posts')`,
    }),
    versions: [
      {
        startCase: await defaultHost.case({
          'module.tsx': `${head}${existing}`,
        }),
        names: ['load', 'save'],
      },
      {
        startCase: await defaultHost.case({
          'module.tsx': `${head}export const added = createServerFn().handler(async () => 'added')\n${existing}`,
        }),
        names: ['load', 'save', 'added'],
      },
    ],
    sourceNames: await defaultHost.case({
      'module.tsx': `${head}export const loadSecretReport = createServerFn().handler(async () => 1)`,
    }),
    trailing: [
      {
        end: '\n// trailing',
        startCase: await defaultHost.case({
          'module.tsx': `${head}export const fn = createServerFn().handler(async () => 'handler')\n// trailing`,
        }),
      },
      {
        end: '\r\n// trailing',
        startCase: await defaultHost.case({
          'module.tsx': `${head}export const fn = createServerFn().handler(async () => 'handler')\r\n// trailing`,
        }),
      },
    ],
  }
  defaultPreview = await defaultHost.preview()

  // `generateFunctionId` gives every server fn the same id.
  customHost = await createStartHost({
    serve: false,
    start: { serverFns: { generateFunctionId: () => 'constant_id' } },
  })
  customCase = await customHost.case({
    'submit-post-formdata.tsx': `${head}export const greetUser = createServerFn().handler(async () => 'first')`,
    'formdata-redirect/index.tsx': `${head}export const greetUser = createServerFn().handler(async () => 'second')`,
    'module.tsx': `export { greetUser as first } from './submit-post-formdata'
export { greetUser as second } from './formdata-redirect'
`,
  })
  await customHost.preview()
}, 120_000)

afterAll(async () => {
  await defaultHost?.close()
  await customHost?.close()
})

describe('production builds', () => {
  // Dev-only code never reaches production (R7). Source: gap SF18 / DV33
  // (N12). The code the build emits for the module's server fn, on the
  // client and the server, holds no HMR code, and the server fn works. The
  // module's code is found by the chunks that hold nothing but the case's
  // modules (their layout is free: wherever the bundler put the module
  // with other code, that chunk is not judged here; the router plugin's
  // paired production builds decide HMR gating, G7).
  test('build providers have no dev HMR code', async () => {
    expect(await callFromClient(defaults.noHmr, 'module.getPosts')).toBe(
      'posts',
    )
    // Behaviour (G7): the production page, which hydrated and ran the
    // case's client code, never read or wrote a development-only global
    // (React Refresh registration, the router plugin's refresh bookkeeping):
    // dev support shipped without its guard fails here even where no
    // `import.meta.hot` text is left to find.
    expect(await defaultHost!.devSupportTouches()).toEqual([])
    const caseDir = `/${defaults.noHmr.dir}/`
    for (const [name, environment] of Object.entries(
      defaultPreview.build.environments,
    )) {
      for (const chunk of environment.chunks) {
        if (
          chunk.moduleIds.length === 0 ||
          !chunk.moduleIds.every((id) => id.includes(caseDir))
        ) {
          continue
        }
        expect(chunk.code, `${name}: ${chunk.fileName}`).not.toMatch(
          /import\.meta\.(webpack)?[Hh]ot/,
        )
      }
    }
  })

  // Within each version of a module the client and the server agree on the
  // ids, and each runs its own handlers by id (SPEC J4.4, G4). Editing the
  // module (here: adding a server fn above the others) changes the
  // effective input, so ids need not survive the edit; the two versions
  // are two modules of one build.
  // Source: SolidStart compile.spec.ts "keeps ids of existing functions when a
  // function is added above them", "keeps production ids stable ..."
  test('build: each version of a module runs its own handlers by id, and the client and server agree on its ids', async () => {
    for (const { startCase, names } of defaults.versions) {
      const read = `Object.fromEntries(${JSON.stringify(names)}.map((name) => [name, module[name].url]))`
      const clientUrls = await inPage(startCase, `return ${read}`)
      const ssr = await startCase.ssr()
      expect(
        Object.fromEntries(names.map((name) => [name, ssr[name].url])),
      ).toEqual(clientUrls)
      for (const name of names) {
        expect(
          await callServerFnThroughCallers(startCase, `module.${name}`),
          name,
        ).toBe(name)
      }
    }
  })

  // Source: SolidStart compile.spec.ts "does not ship source names in production ids"
  test('build ids do not ship source names', async () => {
    const [url] = await serverFnUrls(defaults.sourceNames)
    const id = url!.split('/').filter(Boolean).at(-1)!
    for (const text of [id, Buffer.from(id, 'base64url').toString('latin1')]) {
      expect(text).not.toMatch(/loadSecretReport|module|src/)
    }
    expect(
      await callFromClient(defaults.sourceNames, 'module.loadSecretReport'),
    ).toBe(1)
  })

  // The compiler may append code after the module's last statement.
  // Source: Waku vite-plugin-allow-server.test.ts "transforms with trailing
  // comment without new lines"
  test.each([0, 1])(
    'build: a provider for a module ending in a line comment without a newline (%#)',
    async (index) => {
      const { startCase } = defaults.trailing[index]!
      expect(await callServerFnThroughCallers(startCase, 'module.fn')).toBe(
        'handler',
      )
    },
  )

  // Two server fns of the same name in different files, both given the
  // same id by a custom `generateFunctionId`: the build dedupes them, so
  // each has its own id, which the client and the server agree on, and each
  // id runs its own handler.
  test('dedupes custom ids, the same way across compiler instances', async () => {
    expect(await serverFnUrls(customCase)).toHaveLength(2)
    const ssr = await customCase.ssr()
    expect(
      await inPage(customCase, 'return [module.first.url, module.second.url]'),
    ).toEqual([ssr.first.url, ssr.second.url])
    expect([
      await callServerFnThroughCallers(customCase, 'module.first'),
      await callServerFnThroughCallers(customCase, 'module.second'),
    ]).toEqual(['first', 'second'])
  })
})
