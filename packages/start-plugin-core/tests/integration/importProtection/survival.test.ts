/**
 * Import protection reports a violating client import iff the import
 * survives the build's tree-shaking (SPEC J6.4), on real production builds
 * of each bundler through Start's public plugin: each case of
 * `survival-cases.ts` is an app of its own under `src/cases/<n>/` of one
 * app (its entry imported on demand by the app's entry), so the matrix
 * builds once per bundler. `onViolation` hears of each surviving edge once,
 * never of a dead one. An import `allowImport` allows gets the real module;
 * in error mode, a surviving edge fails the build and a dead one does not.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from '../../file-end'
import { buildStartShared, startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { distinct, rejection } from '../../importProtection/start-apps'
import { cases } from './survival-cases'
import type { StartBuild } from '../../build-harness'
import type { SurvivalCase } from './survival-cases'

/** The directory of case `index`. */
const dirOf = (index: number) => `src/cases/c${index}`

/** A case's files and globs under its directory. */
function placed(c: SurvivalCase, index: number) {
  const at = (file: string) => file.replace(/^src\//, `${dirOf(index)}/`)
  return {
    files: Object.fromEntries(
      Object.entries(c.files).map(([file, code]) => [at(file), code]),
    ),
    entry: at(c.entry ?? 'src/entry.ts'),
    denied: (c.denied ?? []).map(at),
    at,
  }
}

/**
 * One app of `selected` cases: the app's entry exports `load(n)`, which
 * imports case `n`'s entry, and the client file rule is the default one
 * plus each case's own.
 */
function appOf(selected: Array<[SurvivalCase, number]>) {
  const files: Record<string, string> = {}
  const denied: Array<string> = []
  const loaders: Array<string> = []
  for (const [c, index] of selected) {
    const p = placed(c, index)
    Object.assign(files, p.files)
    denied.push(...p.denied)
    loaders.push(
      `  ${index}: () => import('./${p.entry.replace(/^src\//, '').replace(/\.ts$/, '')}'),`,
    )
  }
  files['src/entry.ts'] = `const cases = {\n${loaders.join('\n')}\n}
export const load = (n: keyof typeof cases) => cases[n]()
`
  return {
    files,
    importProtection: {
      behavior: 'mock' as 'mock' | 'error',
      mockAccess: 'off' as const,
      ignoreImporters: ['src/cases/*/exempt/**'],
      client: { files: ['**/*.server.*', ...denied] },
    },
  }
}

/** `importer -> specifier` of each client violation, the importer relative to the app root. */
function edgesOf(build: Pick<StartBuild, 'root' | 'violations'>) {
  return build.violations
    .filter((info) => info.envType === 'client')
    .map(
      (info) =>
        `${info.importer.slice(build.root.length + 1).split('?')[0]} -> ${info.specifier}`,
    )
}

/** The case's expected verdicts, by edge as `edgesOf` names them. */
function expectedOf(c: SurvivalCase, index: number, bundler: string) {
  const { at } = placed(c, index)
  const expected = {
    ...c.expect,
    ...(bundler === 'rsbuild' ? c.rspack : {}),
  }
  return Object.entries(expected).map(([edge, verdict]) => {
    const [importer, specifier] = edge.split(' -> ')
    return { edge: `${at(importer!)} -> ${specifier}`, verdict }
  })
}

const indexed = cases.map((c, index) => [c, index] as [SurvivalCase, number])

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  const openBuild = closeAfterAll()
  beforeAll(async () => {
    const app = appOf(indexed)
    build = await openBuild(() =>
      buildStartShared({
        bundler,
        files: app.files,
        entry: 'src/entry.ts',
        start: { importProtection: app.importProtection },
      }),
    )
  }, 60_000)

  test.each(indexed.map(([c, index]) => ({ name: c.name, c, index })))(
    'reported iff the edge survives: $name',
    ({ c, index }) => {
      const edges = edgesOf(build)
      const prefix = `${dirOf(index)}/`
      const own = edges.filter((edge) => edge.startsWith(prefix))
      const expected = expectedOf(c, index, bundler)
      // once per surviving edge, never for a dead one, nothing unexpected
      expect(own).toEqual(distinct(own))
      for (const edge of own) {
        expect(
          expected.map((e) => e.edge),
          `unexpected report ${edge}`,
        ).toContain(edge)
      }
      expect(
        expected
          .filter(({ edge, verdict }) => verdict === true || own.includes(edge))
          .filter(({ verdict }) => verdict !== null)
          .map(({ edge, verdict }) => [edge, verdict]),
      ).toEqual(
        expected
          .filter(({ verdict }) => verdict === true)
          .map(({ edge, verdict }) => [edge, verdict]),
      )
    },
  )

  /** Cases by name, for the rows below. */
  const named = (name: string) => indexed.find(([c]) => c.name === name)!

  // The allowed import gets the real module, from the only pass; every other
  // edge is judged as usual.
  test.each([
    {
      name: 'a named import, used',
      allow: ['src/entry.ts -> ./secret.server'],
      reported: [],
      out: 'OUT MARK_SECRET',
    },
    {
      // the allowed denied module is real; its own denied import is judged
      name: 'a denied module importing a denied module',
      allow: ['src/entry.ts -> ./secret.server'],
      reported: ['src/secret.server.ts -> ./inner.server'],
      // (`describeValue`: by what the mock does, never by its label)
      out: 'OUT MARK_SECRET a safe mock',
    },
    {
      // a live binding stays live through the allowed import
      name: 'a live binding',
      allow: ['src/entry.ts -> ./counter.server'],
      reported: [],
      out: 'OUT 1',
    },
    {
      // a cycle entered at the target: no TDZ through the allowed import
      name: 'a cycle entered at the target',
      allow: ['src/a.ts -> ./secret.server'],
      reported: [],
      out: 'OUT MARK_SECRET',
    },
  ])(
    'allowImport → true: $name gets the real module',
    async ({ name, allow, reported, out }) => {
      const [c, index] = named(name)
      const { at } = placed(c, index)
      const app = appOf([[c, index]])
      const allowed = allow.map((edge) => {
        const [importer, specifier] = edge.split(' -> ')
        return `${at(importer!)} -> ${specifier}`
      })
      const allowedBuild = await buildStart({
        bundler,
        files: app.files,
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            ...app.importProtection,
            allowImport: (info) =>
              allowed.some(
                (edge) =>
                  edge.endsWith(` -> ${info.specifier}`) &&
                  info.importer.endsWith(edge.split(' -> ')[0]!),
              ),
          },
        },
      })
      expect(edgesOf(allowedBuild)).toEqual(
        reported.map((edge) => {
          const [importer, specifier] = edge.split(' -> ')
          return `${at(importer!)} -> ${specifier}`
        }),
      )
      const { logs } = await allowedBuild.client.run(
        `await entry.load(${index})`,
      )
      expect(logs).toContain(out)
    },
  )

  test('error behaviour fails the build on a surviving edge, and not when nothing survives', async () => {
    const build = (name: string) => {
      const [c, index] = named(name)
      const app = appOf([[c, index]])
      return buildStart({
        bundler,
        files: app.files,
        entry: 'src/entry.ts',
        start: {
          importProtection: { ...app.importProtection, behavior: 'error' },
        },
      })
    }
    const live = await rejection(build('a named import, used'))
    expect(edgesOf(live)).toEqual([
      `${dirOf(named('a named import, used')[1])}/entry.ts -> ./secret.server`,
    ])
    const dead = await build('used only in an unused function')
    expect(edgesOf(dead)).toEqual([])
  })
})
