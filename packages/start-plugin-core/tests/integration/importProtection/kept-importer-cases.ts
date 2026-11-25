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
