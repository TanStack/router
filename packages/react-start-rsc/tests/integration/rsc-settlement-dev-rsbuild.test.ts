/**
 * An Rsbuild dev server (RSC on) serves, after each edit, what a fresh
 * server serves on the same source: a denied file is real exactly when an
 * exempt or allowed import arrives at it from a module the app reaches
 * without a denied module served as its mock (SPEC J6.7). Each app has
 * denied files (`*.client.ts`, denied on the server) that exempt files
 * import, and checked files reaching them through a pattern import
 * (`import.meta.webpackContext`).
 * - Re-entry: the route reaches `upper.client.ts` through exempt
 *   `feature.ts`, whose real module imports exempt `bridge.ts`, which
 *   imports `lower.client.ts`; the route switches to a pattern import of
 *   `upper.client.ts`, then back (each denied file in a layer of its own,
 *   both in none; with a pattern import of `lower.client.ts` beside it).
 * - Two flips in one compilation: in one edit, the route switches to the
 *   pattern import of `upper.client.ts` and `upper.client.ts` starts
 *   importing `bridge.ts`.
 * - A cycle: exempt barrel `kit/index.ts` re-exports `kit/a.client.ts`,
 *   which imports the barrel; the route switches from the barrel to a
 *   pattern import of `a.client.ts`. The same with a checked barrel whose
 *   import of `a.client.ts` `allowImport` allows.
 * - A late lowering: the real module of `upper.client.ts` imports
 *   exempt `ghost.ts`, which reads `lower.client.ts` through a pattern
 *   import and names it in an import the bundler drops (`if (false)`).
 * Source: the RSC phase 1 re-check 3 (/var/tmp/rsc-p1-recheck3/report.md
 * §1, §2 and "Resolver removal, watch and other limits": `restorecycle.py`,
 * `twice.py`), design-rsc-phase1-settlement.md facts 6 and 9 (`reenter.py`,
 * `selfsupport.py`), S1d, S2, S6, S7; re-check 4
 * (/var/tmp/rsc-p1-recheck4/report.md §1 `late-guess.py`, §2
 * `newprobes.py cycle`).
 */
import { describe, expect, test } from 'vitest'
import { recorder, summary } from './rsc-environments-app'
import { startRscRsbuildDevServer } from './rsc-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 90_000

const mock = '[import-protection mock]'

/** The route: renders on the server what `from` reads (and `low` of `lowPattern.ts`: `mixed`), with a caption (`tag`). */
const route = (
  from: string,
  tag: string,
  mixed = false,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../${from}'
${mixed ? `import { read as low } from '../lowPattern'\n` : ''}const label = createIsomorphicFn()
  .server(() => ${mixed ? `String(read()) + ' / ' + String(low())` : 'String(read())'})
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return (
    <main>
      <b>${tag}</b>
      <i data-testid="label">{label()}</i>
    </main>
  )
}
`

/** A module reading `value` of `<dir>/<name>.client.ts` through a context (no import the compiler reads). */
const pattern = (
  name: string,
  dir = './',
) => `const files = import.meta.webpackContext('${dir}', {
  recursive: false,
  regExp: /^\\.\\/${name}\\.client\\.ts$/,
})
export function read() {
  return files('./${name}.client.ts').value()
}
`

const nested = {
  'src/feature.ts': `import { value } from './upper.client'
export const read = () => value()
`,
  'src/topPattern.ts': pattern('upper'),
  'src/lowPattern.ts': pattern('lower'),
  'src/upper.client.ts': `import { read } from './bridge'
export const value = () => 'UP(' + String(read()) + ')'
`,
  'src/bridge.ts': `import { value } from './lower.client'
export const read = () => value()
`,
  'src/lower.client.ts': `export const value = () => 'LOW_REAL'\n`,
}

/** Rsbuild's `tools.rspack`: `rules` added to the server compiler's. */
const serverRules = (rules: Array<Record<string, unknown>>) => ({
  rspack: (
    config: { module: { rules?: Array<unknown> } },
    { environment }: { environment: { name: string } },
  ) => {
    if (environment.name === 'ssr') {
      ;(config.module.rules ??= []).push(...rules)
    }
  },
})

const layers = [
  { test: /upper\.client\.ts$/, layer: 'upper' },
  { test: /lower\.client\.ts$/, layer: 'lower' },
]

/** The route's label in the page the server renders, and whether the page is of `tag`. */
async function page(server: RsbuildDevServer, tag: string) {
  const html = await (await fetch(new URL('/', server.url))).text()
  return {
    tag: html.includes(`<b>${tag}</b>`),
    label: /data-testid="label">([^<]*)</.exec(html)?.[1],
  }
}

/** Whether the server reported R147 (a denied file served as it is that a checked importer reaches) since `since`. */
const conflict = (server: RsbuildDevServer, since: number) =>
  server.diagnostics
    .slice(since)
    .some(({ text }) => text.includes('Reached by checked importers'))

/** Whether the server reported an internal error of the settlement since `since`. */
const unsettled = (server: RsbuildDevServer, since: number) =>
  server.diagnostics
    .slice(since)
    .some(({ text }) => /did not settle|could not settle/.test(text))

async function start(
  files: Record<string, string>,
  exclude: Array<string>,
  rules: Array<Record<string, unknown>>,
  allow?: Parameters<typeof recorder>[1],
) {
  const { violations, start: options } = recorder('mock', allow)
  const server = await startRscRsbuildDevServer({
    browser: true,
    start: {
      importProtection: { ...options.importProtection, exclude },
    },
    config: { tools: serverRules(rules) },
    files,
  })
  return { server, violations }
}

describe('Rsbuild dev with RSC, a denied file whose exempt importer only a real denied file brings', () => {
  test.for([
    { layout: 'a layer each', rules: layers, mixed: false },
    { layout: 'no layer', rules: [], mixed: false },
    {
      layout: 'no layer, and a pattern import of the lower file',
      rules: [],
      mixed: true,
    },
  ])(
    '$layout: served as a fresh server serves it after the route leaves the importer and comes back',
    { timeout },
    async ({ rules, mixed }) => {
      const { server, violations } = await start(
        { ...nested, 'src/routes/index.tsx': route('feature', 'LIVE', mixed) },
        ['**/feature.ts', '**/bridge.ts'],
        rules,
      )
      const real = mixed ? 'UP(LOW_REAL) / LOW_REAL' : 'UP(LOW_REAL)'
      const steps: Array<{
        tag: string
        from: string
        label: string
        conflict: boolean
        reported: Array<string>
      }> = [
        // (with the pattern import of the lower file, its exempt importer
        // and the pattern import disagree: R147)
        {
          tag: 'LIVE',
          from: 'feature',
          label: real,
          conflict: mixed,
          reported: [],
        },
        {
          tag: 'DROP',
          from: 'topPattern',
          label: mixed ? `${mock} / ${mock}` : mock,
          conflict: false,
          reported: [
            ...(mixed
              ? ['ssr server file lower.client.ts -> src/lower.client.ts']
              : []),
            'ssr server file upper.client.ts -> src/upper.client.ts',
          ],
        },
        {
          tag: 'BACK',
          from: 'feature',
          label: real,
          conflict: mixed,
          reported: [],
        },
        {
          tag: 'TOUCH',
          from: 'feature',
          label: real,
          conflict: mixed,
          reported: [],
        },
      ]
      for (const step of steps) {
        const since = server.diagnostics.length
        const reported = violations.length
        if (step.tag !== 'LIVE') {
          await server.edit({
            'src/routes/index.tsx': route(step.from, step.tag, mixed),
          })
        }
        expect({
          step: step.tag,
          page: await page(server, step.tag),
          conflict: conflict(server, step.tag === 'LIVE' ? 0 : since),
          unsettled: unsettled(server, 0),
          reported: summary(violations.slice(reported)),
        }).toEqual({
          step: step.tag,
          page: { tag: true, label: step.label },
          conflict: step.conflict,
          unsettled: false,
          reported: step.reported,
        })
      }
    },
  )
})

describe('Rsbuild dev with RSC, one edit that flips two denied files', () => {
  test.for([
    { layout: 'a layer each', rules: layers },
    { layout: 'no layer', rules: [] },
  ])(
    '$layout: both are served as their mock, no conflict, no internal error',
    { timeout },
    async ({ rules }) => {
      const { server, violations } = await start(
        {
          ...nested,
          'src/upperPattern.ts': pattern('upper'),
          'src/lowerPattern.ts': pattern('lower'),
          'src/upper.client.ts': `export const value = () => 'UP_INITIAL'\n`,
          'src/routes/index.tsx': route('feature', 'initial', true).replace(
            '../lowPattern',
            '../lowerPattern',
          ),
        },
        ['**/feature.ts', '**/bridge.ts'],
        rules,
      )
      expect(await page(server, 'initial')).toEqual({
        tag: true,
        label: `UP_INITIAL / ${mock}`,
      })
      const since = server.diagnostics.length
      for (const tag of ['flip', 'touch']) {
        const before = server.diagnostics.length
        await server.edit({
          ...(tag === 'flip' && {
            'src/upper.client.ts': nested['src/upper.client.ts'],
          }),
          'src/routes/index.tsx': route('upperPattern', tag, true).replace(
            '../lowPattern',
            '../lowerPattern',
          ),
        })
        // (the watcher may split the flip's two writes into two
        // compilations, and the first state, the bridge real with the
        // pattern import of the lower file, has importers that disagree: the
        // final state's R147, if any, is reported again by the touch's
        // compilation, as by every compilation holding it)
        expect({
          page: await page(server, tag),
          ...(tag === 'touch' && { conflict: conflict(server, before) }),
          unsettled: unsettled(server, since),
        }).toEqual({
          page: { tag: true, label: `${mock} / ${mock}` },
          ...(tag === 'touch' && { conflict: false }),
          unsettled: false,
        })
      }
      expect(summary(violations)).toEqual([
        'ssr server file lower.client.ts -> src/lower.client.ts',
        'ssr server file upper.client.ts -> src/upper.client.ts',
      ])
    },
  )
})

describe('Rsbuild dev with RSC, a denied file in a cycle with its barrel', () => {
  test.for([
    {
      grant: 'an exempt barrel',
      exclude: ['**/kit/index.ts'],
      allow: undefined,
    },
    // (re-check 4 §2: 012645978b and db260cf3a3 kept `A_REAL H`, with R147)
    {
      grant: 'a checked barrel whose import allowImport allows',
      exclude: [],
      allow: (info: { importer: string; specifier: string }) =>
        info.importer.endsWith('/kit/index.ts') &&
        info.specifier === './a.client',
    },
  ])(
    '$grant: once only a pattern import reaches it, it is served as its mock and reported once, no conflict',
    { timeout },
    async ({ exclude, allow }) => {
      const { server, violations } = await start(
        {
          'src/kit/index.ts': `export { value } from './a.client'
export const helper = () => 'H'
`,
          'src/kit/a.client.ts': `import { helper } from './index'
export const value = () => 'A_REAL ' + helper()
`,
          'src/feature.ts': `import { value } from './kit/index'
export const read = () => value()
`,
          'src/topPattern.ts': pattern('a', './kit'),
          'src/routes/index.tsx': route('feature', 'LIVE'),
        },
        exclude,
        [],
        allow,
      )
      expect(await page(server, 'LIVE')).toEqual({
        tag: true,
        label: 'A_REAL H',
      })
      expect(summary(violations)).toEqual([])
      const since = server.diagnostics.length
      for (const tag of ['DROP', 'TOUCH']) {
        await server.edit({ 'src/routes/index.tsx': route('topPattern', tag) })
        expect({
          page: await page(server, tag),
          conflict: conflict(server, since),
          reported: summary(violations),
        }).toEqual({
          page: { tag: true, label: mock },
          conflict: false,
          reported: ['ssr server file a.client.ts -> src/kit/a.client.ts'],
        })
      }
      expect(violations).toHaveLength(1)
    },
  )
})

describe('Rsbuild dev with RSC, a denied file a round of the settlement brings, which only a pattern import reaches', () => {
  test(
    'it is served as its mock, no internal error, no conflict',
    async () => {
      const { server, violations } = await start(
        {
          'src/feature.ts': nested['src/feature.ts'],
          'src/upper.client.ts': `import { read } from './ghost'
export const value = () => 'UP(' + String(read()) + ')'
`,
          'src/ghost.ts': `import { read as viaPattern } from './lowPattern'
if (false) import('./lower.client')
export const read = () => String(viaPattern())
`,
          'src/lowPattern.ts': pattern('lower'),
          'src/lower.client.ts': nested['src/lower.client.ts'],
          'src/routes/index.tsx': route('feature', 'INITIAL'),
        },
        ['**/feature.ts', '**/ghost.ts'],
        [layers[0]!],
      )
      for (const tag of ['INITIAL', 'TOUCH']) {
        const since = server.diagnostics.length
        if (tag !== 'INITIAL') {
          await server.edit({ 'src/routes/index.tsx': route('feature', tag) })
        }
        expect({
          page: await page(server, tag),
          conflict: conflict(server, tag === 'INITIAL' ? 0 : since),
          unsettled: unsettled(server, 0),
          reported: summary(violations),
        }).toEqual({
          page: { tag: true, label: `UP(${mock})` },
          conflict: false,
          unsettled: false,
          reported: ['ssr server file lower.client.ts -> src/lower.client.ts'],
        })
      }
    },
    timeout,
  )
})
