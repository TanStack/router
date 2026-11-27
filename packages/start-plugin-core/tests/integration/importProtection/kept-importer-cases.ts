/**
 * The cases of `kept-importers.test.ts` and `own-and-type-imports.test.ts`:
 * an app whose client reaches a denied module only through an import the
 * compiler does not decide alone (a package module, another plugin's
 * import, an entry's own marker, an import of type specifiers only), each
 * built with protection on (`behavior: 'error'`) and off. Protection off
 * shows what the bundler itself keeps: the denied module's initializer
 * (`MARK_DB`) in the client output or not.
 */
import { StartBuildError, buildStart } from '../../build-harness'
import { reportedViolations } from '../../importProtection/start-apps'
import { lateImport } from './late-import'
import type { StartBundler } from '../../build-harness'

export const timeout = 60_000

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

/** The paths of case `i` of `outcomesOfCases`: `src/` under `src/c<i>/`, the package `dep` as `dep<i>`. */
export const inCase = (i: number, file: string) =>
  file
    .replace(/^src\//, `src/c${i}/`)
    .replace(/^node_modules\/dep\//, `node_modules/dep${i}/`)

/**
 * `outcome` of each of `cases` (none `verbatim`) from one app per protection
 * state: case `i` in `src/c<i>/` with its package as `dep<i>` and its
 * initializer `MARK_DB_<i>_` (`inCase`), the entry re-exporting each case's
 * entry as a namespace, each case's `late` code added to its own
 * `src/c<i>/late.js`. Three builds: protection on in error mode (`failedAt`:
 * the case's own client violations, root-relative, position cut; null when
 * it has none), on in mock mode (what ships with protection on, and the
 * case's own client reports) and off (what the bundler itself keeps).
 */
export async function outcomesOfCases(
  bundler: StartBundler,
  cases: Array<KeptCase>,
): Promise<
  (i: number) => {
    failedAt: Array<string> | null
    mocked: { reported: Array<string>; shipped: boolean }
    offShipped: boolean
  }
> {
  const files: Record<string, string> = {
    'src/entry.ts': cases
      .map((_, i) => `export * as c${i} from './c${i}/entry'\n`)
      .join(''),
  }
  for (const [i, c] of cases.entries()) {
    if (c.verbatim) {
      throw new Error(`${c.name}: a verbatim case needs an app of its own`)
    }
    for (const [file, text] of Object.entries(c.files)) {
      files[inCase(i, file)] = text
        .replaceAll('MARK_DB', `MARK_DB_${i}_`)
        .replace(/(['"])dep\1/g, `$1dep${i}$1`)
    }
  }
  const late = lateImport(
    Object.fromEntries(
      cases.flatMap((c, i) =>
        c.late === undefined ? [] : [[`c${i}`, c.late]],
      ),
    ),
  )
  const build = (importProtection: Record<string, unknown>) =>
    buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      start: { importProtection },
      ...(bundler === 'vite'
        ? { viteConfig: late.viteConfig }
        : { rsbuildConfig: late.rsbuildConfig }),
    })
  const clientImporters = (
    violations: Parameters<typeof reportedViolations>[0],
  ) =>
    reportedViolations(violations)
      .filter((v) => v.environment === 'client')
      .map((v) => v.importer.replace(/:\d+(:\d+)?$/, ''))
  const failed = await build({ behavior: 'error' }).then(
    () => [] as Array<string>,
    (error: unknown) => {
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      return clientImporters(error)
    },
  )
  const mocked = await build({ behavior: 'mock', mockAccess: 'off' })
  const mockReported = clientImporters(mocked)
  const off = await build({ enabled: false })
  const own = (i: number) => (file: string) =>
    file.startsWith(`src/c${i}/`) || file.startsWith(`node_modules/dep${i}/`)
  return (i) => {
    const failedAt = [...new Set(failed.filter(own(i)))]
    return {
      failedAt: failedAt.length > 0 ? failedAt : null,
      mocked: {
        reported: [...new Set(mockReported.filter(own(i)))],
        shipped: mocked.client.where(`MARK_DB_${i}_`) !== 'nowhere',
      },
      offShipped: off.client.where(`MARK_DB_${i}_`) !== 'nowhere',
    }
  }
}
