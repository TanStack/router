/**
 * Rsbuild builds, watch builds and dev servers (RSC off) serve what a fresh
 * build of the source serves when the settlement of one compilation lowers
 * the same denied file twice: a module that leaves the compilation and
 * comes back is a new module with a new guess (SPEC J6.7).
 * The route reads `a.client.ts` through `readA.ts` (checked, a context) and
 * `b.client.ts` through `grantB.ts` (exempt). The real module of
 * `b.client.ts` brings `c.client.ts` through `grantC.ts` (exempt), whose
 * real module brings `ghost.ts` (exempt): it reads `low.client.ts` through
 * `pattern.ts` (checked, a context) and names it in an import the bundler
 * drops (`if (false)`). The real module of `a.client.ts` imports
 * `low.client.ts` through `grantLow.ts` (exempt). Each denied file is in a
 * layer of the server compiler's, `low.client.ts` with its two importers.
 * So `a.client.ts` and `low.client.ts` are their mocks, `b.client.ts` and
 * `c.client.ts` real: `SWITCH <mock> / B:C:<mock>`. The settlement lowers
 * `low.client.ts` (it left with `a.client.ts`'s imports), builds `b`, then
 * `c`, and lowers `low.client.ts` again: it came back with `ghost.ts`,
 * guessed real from the dropped import.
 * - `cold`: the route reads `a.client.ts` through `guessA.ts` (exempt),
 *   which reads it through `readA.ts` and names it in an import the bundler
 *   drops: `a.client.ts` is guessed real on the first compile.
 * - `clean`: the route reads `a.client.ts` through `grantA.ts` (exempt) and
 *   `low.client.ts` through `grantLow.ts`, then switches to `readA.ts` and
 *   `grantB.ts`.
 * Source: the RSC phase 1 re-check 5 (/var/tmp/rsc-p1-recheck5/cleanflip5.py,
 * apps `experiments/{head,base,main}/ordinary-*`: 5dbc22c196 refused the
 * second lowering, "could not settle", db260cf3a3 served `LOW_REAL` with
 * R147), design-rsc-phase1-settlement.md amendment 2, U0 to U4.
 */
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { buildStart } from '../../build-start'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import {
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'

/** What a fixture renders for a mock (`describeValue`: by what it does, never by its label, SPEC §5.18). */
const mock = 'a safe mock'

/** A module reading `value` of `<name>.client.ts` through a context (no import the compiler reads). */
const pattern = (
  name: string,
) => `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/${name}\\.client\\.ts$/,
})
export const read = () => files('./${name}.client.ts').value()
`

/** An exempt module reading `value` of `<name>.client.ts`. */
const grant = (name: string) => `import { value } from './${name}.client'
export const read = () => String(value())
`

/** The route: renders on the server `<tag> <first> / <second>`, of `read` of each module. */
const route = (
  tag: string,
  first: string,
  second: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../${first}'
import { read as second } from '../${second}'
${describeValuePrelude}
const label = createIsomorphicFn()
  .server(() => '${tag} ' + describeValue(read(), 'REAL') + ' / ' + describeValue(second(), 'REAL'))
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main data-testid="label">{label()}</main>
}
`

const app = {
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
  'src/a.client.ts': `import { read } from './grantLow'
export const value = () => 'A:' + String(read())
`,
  'src/b.client.ts': `import { read } from './grantC'
export const value = () => 'B:' + String(read())
`,
  'src/c.client.ts': `import { read } from './ghost'
export const value = () => 'C:' + String(read())
`,
  'src/low.client.ts': `export const value = () => 'LOW_REAL'\n`,
  'src/grantA.ts': grant('a'),
  'src/grantB.ts': grant('b'),
  'src/grantC.ts': grant('c'),
  'src/grantLow.ts': grant('low'),
  'src/ghost.ts': `import { read as viaPattern } from './pattern'
if (false) import('./low.client')
${describeValuePrelude}
export const read = () => describeValue(viaPattern(), 'LOW_REAL')
`,
  'src/pattern.ts': pattern('low'),
  'src/readA.ts': pattern('a'),
  'src/guessA.ts': `import { read as viaPattern } from './readA'
if (false) import('./a.client')
export const read = () => viaPattern()
`,
}

const cold = {
  ...app,
  'src/routes/index.tsx': route('SWITCH', 'guessA', 'grantB'),
}

/** `cold` without `ghost.ts`'s dropped import: `low.client.ts` comes back guessed as its mock (the control). */
const coldNoDead = {
  ...cold,
  'src/ghost.ts': `import { read as viaPattern } from './pattern'
${describeValuePrelude}
export const read = () => describeValue(viaPattern(), 'LOW_REAL')
`,
}

const clean = {
  ...app,
  'src/routes/index.tsx': route('LIVE', 'grantA', 'grantLow'),
}

// (`mockAccess: 'off'`: a mock the server calls is not an error of the
// compilation)
const importProtection = {
  behavior: 'mock' as const,
  mockAccess: 'off' as const,
  exclude: ['**/grant*.ts', '**/ghost.ts', '**/guessA.ts'],
}

/** The server compiler's layers: one per denied file, `low.client.ts` with its importers. */
const environments = {
  ssr: {
    tools: {
      rspack: {
        module: {
          rules: [
            { test: /(guessA|a\.client)\.ts$/, layer: 'one' },
            { test: /b\.client\.ts$/, layer: 'two' },
            { test: /c\.client\.ts$/, layer: 'three' },
            { test: /(ghost|grantLow|low\.client)\.ts$/, layer: 'common' },
          ],
        },
      },
    },
  },
}

/** The texts of the elements of `html` with `data-testid` `id`. */
const texts = (html: string, id: string) =>
  [...html.matchAll(new RegExp(`data-testid="${id}">([^<]*)<`, 'g'))].map(
    (m) => m[1],
  )

/** The distinct violations of `recorded`, by importer file and specifier. */
const reported = (recorded: Recorded) =>
  [
    ...new Set(
      violationsOf(recorded).map(({ importer, specifier }) =>
        JSON.stringify({ importer: importer.replace(/:.*/, ''), specifier }),
      ),
    ),
  ]
    .map((v) => JSON.parse(v) as { importer: string; specifier: string })
    .sort((x, y) => x.importer.localeCompare(y.importer))

/**
 * The distinct denied files `recorded` reports (a dev server reports a
 * context's import at the denied file).
 */
const mocked = (recorded: Recorded) =>
  [...new Set(violationsOf(recorded).map(({ specifier }) => specifier))].sort()

/** What the final source reports: the two contexts, each reaching a mock. */
const contexts = [
  { importer: 'src/pattern.ts', specifier: 'src/low.client.ts' },
  { importer: 'src/readA.ts', specifier: 'src/a.client.ts' },
]

const build = (
  files: Record<string, string>,
  watchEdits?: Record<string, string>,
) =>
  buildStart({
    bundler: 'rsbuild',
    files,
    entry: 'src/entry.ts',
    rsbuildConfig: { environments },
    start: { importProtection } as never,
    ...(watchEdits && { watchEdits }),
  })

async function served(built: Awaited<ReturnType<typeof build>>) {
  const { url } = await built.preview()
  const response = await fetch(new URL('/', url))
  return {
    status: response.status,
    label: texts(await response.text(), 'label'),
    reported: reported(built),
  }
}

describe('Rsbuild build, a denied file the settlement lowers, which comes back guessed real', () => {
  test.each([
    { fixture: 'the dropped import', files: cold },
    { fixture: 'no dropped import (control)', files: coldNoDead },
  ])(
    '$fixture: the build serves both contexts their mock',
    async ({ files }) => {
      expect(await served(await build(files))).toEqual({
        status: 200,
        label: [`SWITCH ${mock} / B:C:${mock}`],
        reported: contexts,
      })
    },
  )
})

describe('rsbuild build --watch, an edit after which the settlement lowers a denied file twice', () => {
  test('the rebuild serves what a fresh build serves', async () => {
    const built = await build(clean, {
      'src/routes/index.tsx': route('SWITCH', 'readA', 'grantB'),
    })
    expect(await served(built)).toEqual({
      status: 200,
      label: [`SWITCH ${mock} / B:C:${mock}`],
      reported: contexts,
    })
  })
})

describe('Rsbuild dev, a denied file the settlement lowers twice', () => {
  async function start(files: Record<string, string>) {
    const recorder = violationRecorder(importProtection)
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { tools: { htmlPlugin: false }, environments },
      start: { importProtection: recorder.importProtection },
      files,
    })
    /** The page, the errors reported since `since`, and the denied files reported so far. */
    const page = async (since: number) => {
      const response = await fetch(new URL('/', server.url))
      return {
        status: response.status,
        label: texts(await response.text(), 'label'),
        errors: reportedErrors(server, since),
        reported: mocked({ root: server.root, ...recorder }),
      }
    }
    return { server, page }
  }

  test('cold: the first load serves both contexts their mock, no error', async () => {
    const { page } = await start(cold)
    expect(await page(0)).toEqual({
      status: 200,
      label: [`SWITCH ${mock} / B:C:${mock}`],
      errors: [],
      reported: ['src/a.client.ts', 'src/low.client.ts'],
    })
  })

  test('clean: after the switch and a touch, the page is what a fresh server serves, no error', async () => {
    const { server, page } = await start(clean)
    expect(await page(0)).toEqual({
      status: 200,
      label: ['LIVE A:LOW_REAL / LOW_REAL'],
      errors: [],
      reported: [],
    })
    for (const tag of ['SWITCH', 'TOUCH']) {
      const since = server.diagnostics.length
      await server.edit({
        'src/routes/index.tsx': route(tag, 'readA', 'grantB'),
      })
      expect({ tag, ...(await page(since)) }).toEqual({
        tag,
        status: 200,
        label: [`${tag} ${mock} / B:C:${mock}`],
        errors: [],
        reported: ['src/a.client.ts', 'src/low.client.ts'],
      })
    }
  })
})
