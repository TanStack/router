/**
 * The cases of `kept-importers.test.ts` and `own-and-type-imports.test.ts`:
 * an app whose client reaches a denied module only through an import the
 * compiler does not decide alone (a package module, another plugin's
 * import, an entry's own marker, an import of type specifiers only), each
 * built with protection on (`behavior: 'error'`) and off. Protection off
 * shows what the bundler itself keeps: the denied module's initializer
 * (`MARK_DB`) in the client output or not.
 */
import { StartBuildError } from '../../build-harness'
import { buildStart } from '../../build-start'
import { reportedViolations } from '../../importProtection/start-apps'
import { lateImport } from './late-import'
import type { StartBundler } from '../../build-harness'

/** A denied module of the app with an initializer. */
export const db = {
  'src/db.server.ts': `;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
export interface User {
  name: string
}
export const secret = 'MARK_SECRET'
`,
}

/** A package `dep` of `files`, its `package.json` from `manifest`. */
export const dep = (
  files: Record<string, string>,
  manifest: Record<string, unknown> = {},
) => ({
  'node_modules/dep/package.json': JSON.stringify({
    name: 'dep',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    ...manifest,
  }),
  ...Object.fromEntries(
    Object.entries(files).map(([file, code]) => [
      `node_modules/dep/${file}`,
      code,
    ]),
  ),
})

/** A file of `dep` with the server-only marker and an initializer. */
export const marked = `import '@tanstack/react-start/server-only'
globalThis.connected = 'MARK_DB'
export const secret = 'MARK_SECRET'
`

export interface KeptCase {
  name: string
  files: Record<string, string>
  /** Code another plugin adds at the top of `src/late.js` (after Start's compile). */
  late?: string
  /** TypeScript keeps imports as written (tsconfig for Vite, `tools.swc` for Rsbuild). */
  verbatim?: boolean
}

/**
 * A build of `c` with protection on or off: the client violations that
 * failed it (root-relative importers, position cut; null when it built),
 * and whether the client output holds the denied initializer.
 */
export async function outcome(
  bundler: StartBundler,
  c: KeptCase,
  enabled: boolean,
): Promise<{ failedAt: Array<string> | null; shipped: boolean }> {
  const late = c.late === undefined ? null : lateImport(c.late)
  const files = {
    ...c.files,
    ...(c.verbatim && {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true },
      }),
    }),
  }
  try {
    const build = await buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      start: {
        importProtection: enabled ? { behavior: 'error' } : { enabled: false },
      },
      ...(bundler === 'vite'
        ? { viteConfig: late?.viteConfig }
        : {
            rsbuildConfig: {
              ...late?.rsbuildConfig,
              ...(c.verbatim && {
                tools: {
                  swc: { jsc: { transform: { verbatimModuleSyntax: true } } },
                },
              }),
            },
          }),
    })
    return {
      failedAt: null,
      shipped: build.client.where('MARK_DB') !== 'nowhere',
    }
  } catch (error) {
    if (!(error instanceof StartBuildError)) {
      throw error
    }
    return {
      failedAt: reportedViolations(error)
        .filter((v) => v.environment === 'client')
        .map((v) => v.importer.replace(/:\d+(:\d+)?$/, '')),
      shipped: false,
    }
  }
}

/** The directory of the case `name` of `outcomesOfCases` (its name as a slug: an error of the shared app names it). */
const caseDir = (name: string) =>
  name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

/** The paths of the case `name` of `outcomesOfCases`: `src/` under `src/<case>/`, the package `dep` as `dep-<case>`. */
export const inCase = (name: string, file: string) =>
  file
    .replace(/^src\//, `src/${caseDir(name)}/`)
    .replace(/^node_modules\/dep\//, `node_modules/dep-${caseDir(name)}/`)

/**
 * `outcome` of each of `cases` (none `verbatim`; `on`: the case's refused
 * importers, null when its error-mode build succeeds) from shared apps: a
 * case in `src/<case>/` with its package as `dep-<case>` (`inCase`) and its
 * initializer `MARK_DB_<i>_`, an app's entry re-exporting each of its cases'
 * entries as a namespace, each case's `late` code added to its own
 * `src/<case>/late.js`. Protection on in error mode, two apps (a build's
 * success or failure is the whole app's): the refused cases' (`failedAt`:
 * the case's own client violations, root-relative, position cut; null when
 * it has none; `refused`: every violation of that app, client and server,
 * as `<environment> <importer>`, duplicates kept) and the allowed cases'
 * (`failedAt`: null when it builds, else every violation of the app, as
 * `refused` gives them). Protection on in mock mode (what ships with
 * protection on, and the case's own client reports) and off (what the
 * bundler itself keeps): one app of every case each.
 */
export async function outcomesOfCases(
  bundler: StartBundler,
  cases: Array<KeptCase & { on: Array<string> | null }>,
): Promise<{
  of: (i: number) => {
    failedAt: Array<string> | null
    mocked: { reported: Array<string>; shipped: boolean }
    offShipped: boolean
  }
  refused: Array<string>
}> {
  const caseFiles = (i: number) => {
    const c = cases[i]!
    if (c.verbatim) {
      throw new Error(`${c.name}: a verbatim case needs an app of its own`)
    }
    return Object.fromEntries(
      Object.entries(c.files).map(([file, text]) => [
        inCase(c.name, file),
        text
          .replaceAll('MARK_DB', `MARK_DB_${i}_`)
          .replace(/(['"])dep\1/g, `$1dep-${caseDir(c.name)}$1`),
      ]),
    )
  }
  /** The app of the cases `of` (indexes). */
  const appOf = (of: Array<number>): Record<string, string> => ({
    ...Object.assign({}, ...of.map(caseFiles)),
    'src/entry.ts': of
      .map(
        (i) => `export * as c${i} from './${caseDir(cases[i]!.name)}/entry'\n`,
      )
      .join(''),
  })
  const late = lateImport(
    Object.fromEntries(
      cases.flatMap((c) =>
        c.late === undefined ? [] : [[caseDir(c.name), c.late]],
      ),
    ),
  )
  const build = (
    of: Array<number>,
    importProtection: Record<string, unknown>,
  ) =>
    buildStart({
      bundler,
      files: appOf(of),
      entry: 'src/entry.ts',
      start: { importProtection },
      ...(bundler === 'vite'
        ? { viteConfig: late.viteConfig }
        : { rsbuildConfig: late.rsbuildConfig }),
    })
  const clientImporters = (
    violations: Parameters<typeof reportedViolations>[0],
  ) => [
    ...new Set(
      reportedViolations(violations)
        .filter((v) => v.environment === 'client')
        .map((v) => v.importer.replace(/:\d+(:\d+)?$/, '')),
    ),
  ]
  /**
   * What an error-mode build of `of` failed with: its client importers
   * (`client`) and every violation (`all`, `<environment> <importer>`,
   * position cut, sorted, duplicates kept); null when it built.
   */
  const errorBuild = (of: Array<number>) =>
    of.length === 0
      ? Promise.resolve(null)
      : build(of, { behavior: 'error' }).then(
          () => null,
          (error: unknown) => {
            if (!(error instanceof StartBuildError)) {
              throw error
            }
            return {
              client: clientImporters(error).sort(),
              all: reportedViolations(error)
                .map(
                  (v) =>
                    `${v.environment} ${v.importer.replace(/:\d+(:\d+)?$/, '')}`,
                )
                .sort(),
            }
          },
        )
  const all = cases.map((_, i) => i)
  const refusing = all.filter((i) => cases[i]!.on !== null)
  const allowed = all.filter((i) => cases[i]!.on === null)
  const refusal = await errorBuild(refusing)
  const allowedFailure = (await errorBuild(allowed))?.all ?? null
  const mocked = await build(all, { behavior: 'mock', mockAccess: 'off' })
  const mockReported = clientImporters(mocked)
  const off = await build(all, { enabled: false })
  const own = (i: number) => (file: string) =>
    file.startsWith(`src/${caseDir(cases[i]!.name)}/`) ||
    file.startsWith(`node_modules/dep-${caseDir(cases[i]!.name)}/`)
  return {
    of: (i) => {
      const failedAt = (refusal?.client ?? []).filter(own(i))
      return {
        failedAt:
          cases[i]!.on === null
            ? allowedFailure
            : failedAt.length > 0
              ? failedAt
              : null,
        mocked: {
          reported: mockReported.filter(own(i)),
          shipped: mocked.client.where(`MARK_DB_${i}_`) !== 'nowhere',
        },
        offShipped: off.client.where(`MARK_DB_${i}_`) !== 'nowhere',
      }
    },
    refused: refusal?.all ?? [],
  }
}
