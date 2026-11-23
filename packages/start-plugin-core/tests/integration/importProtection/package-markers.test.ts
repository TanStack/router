/**
 * The server-only marker in a package's module, in real Start builds (Vite
 * and Rsbuild), node_modules policy decisions 1, 7 and 8 (SPEC J6.10): a
 * marker is honoured in every module the compiler is handed, whatever
 * package holds it, and it denies the file to every importer that is not
 * exempt (`exclude`, `ignoreImporters`) or allowed (`allowImport`). An
 * importer the compiler does not compile (a package barrel naming no Start
 * API) is a violation too, reported at its import of the file.
 *
 * Asserted per case: the build's outcome, the importer the report names
 * with its line, and what the client bundle holds.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { buildStart, startBundlers } from '../../build-harness'
import { appManifest, installPackage } from '../../package-layouts'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import type { PackageLayout, StartDeclaration } from '../../package-layouts'
import type { StartBundler } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

/** `audit-lib`: a barrel re-exporting a marked module and a safe value. */
const auditLib = (declaration: StartDeclaration, sideEffects?: boolean) => ({
  name: 'audit-lib',
  declaration,
  ...(sideEffects !== undefined && { manifest: { sideEffects } }),
  files: {
    'index.js': `export { secret } from './secret.js'\nexport const SAFE = 'MARK_SAFE'\n`,
    'secret.js': `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
  },
})

/** The app of `layout`, its client entry reading `use` of `audit-lib`. */
function app(
  layout: PackageLayout,
  declaration: StartDeclaration,
  use: 'secret' | 'SAFE',
  sideEffects?: boolean,
) {
  const lib = installPackage(layout, auditLib(declaration, sideEffects))
  return {
    lib,
    options: {
      files: {
        ...lib.files,
        'src/entry.ts':
          use === 'secret'
            ? `import { secret } from '${lib.importAs}'\nexport const read = () => secret()\n`
            : `import { SAFE } from '${lib.importAs}'\nexport const read = () => SAFE\n`,
      },
      symlinks: lib.symlinks,
      packageJson: appManifest([lib]),
      entry: 'src/entry.ts',
    },
  }
}

/** `layout` and declaration of each case of a marked module behind a package barrel. */
const barrelCases: Array<[PackageLayout, StartDeclaration]> = [
  ['npm', 'peer'],
  ['pnpm', 'none'],
  ['workspace', 'none'],
  ['alias', 'peer'],
]

describe.each(startBundlers)('%s build', (bundler: StartBundler) => {
  // On main, Vite fails these builds (its Rsbuild adapter ships the marked
  // module); before the policy, the PR's compiler skipped markers under
  // `node_modules` (`excludeFiles`) and shipped it on both hosts.
  // Source: node_modules policy, decision 1 (A) and the reviews' `1c`,
  // `1d`, `ws-both`.
  test.each(barrelCases)(
    'a marked module behind a package barrel (%s layout, %s declaration) fails the build at the barrel',
    async (layout, declaration) => {
      const { lib, options } = app(layout, declaration, 'secret')
      const error = await rejection(buildStart({ bundler, ...options }))
      const reported = reportedViolations(error)
      expect(reported).not.toEqual([])
      for (const { environment, importer } of reported) {
        expect(environment).toBe('client')
        expect(importer).toMatch(
          new RegExp(
            `^${lib.directory.replace(/[.+]/g, '\\$&')}/index\\.js:1:`,
          ),
        )
      }
    },
    timeout,
  )

  // The app imports only the safe export of a barrel whose package declares
  // no `sideEffects`: the marked module is analysed, has no effect, and the
  // bundler drops it.
  // Source: Gemini review of the policy, G-H3 (`B14-mixed-barrel-se-true`).
  test(
    'a mixed barrel without sideEffects, the app using only its safe export, builds with only the safe export in the client',
    async () => {
      const { options } = app('npm', 'peer', 'SAFE')
      const build = await buildStart({ bundler, ...options })
      expect(build.client.where('MARK_SAFE')).not.toBe('nowhere')
      expect(build.client.where('MARK_SECRET')).toBe('nowhere')
      expect(reportedViolations(build)).toEqual([])
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  // An importer the user exempts is compiled: its imports are read, and the
  // marked module it imports is the real one, with nothing reported.
  // Source: reviews of the policy, A-H2a and G-H1 (`ignore`, `exclude`).
  test.each<[string, ImportProtectionOptions]>([
    ['ignoreImporters', { ignoreImporters: ['**/audit-lib/index.js'] }],
    ['exclude', { exclude: ['**/audit-lib/index.js'] }],
  ])(
    'the package barrel listed in %s gets the real module, nothing reported',
    async (_, importProtection) => {
      const { options } = app('npm', 'none', 'secret')
      const build = await buildStart({
        bundler,
        ...options,
        start: { importProtection },
      })
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_SECRET')
      expect(reportedViolations(build)).toEqual([])
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  // Decision 8's contract: for an importer the compiler does not compile,
  // `allowImport` is asked once about the marked file, with the file as
  // `importer` and as `resolved`; allowing it gives the real module.
  // Source: node_modules policy, decision 8 (A).
  test(
    'allowImport is asked about the marked file with the file as importer and resolved; allowing it gives the real module',
    async () => {
      const { lib, options } = app('npm', 'none', 'secret')
      const asked: Array<{ importer: string; resolved?: string }> = []
      const build = await buildStart({
        bundler,
        ...options,
        start: {
          importProtection: {
            allowImport: (info) => {
              asked.push({ importer: info.importer, resolved: info.resolved })
              return info.resolved?.endsWith('/audit-lib/secret.js') === true
            },
          },
        },
      })
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_SECRET')
      const secret = `${build.root}/${lib.directory}/secret.js`
      expect(asked).toEqual([{ importer: secret, resolved: secret }])
    },
    timeout,
  )

  // `excludeFiles` skips the file-name rules only: a marked app file it
  // matches is still denied (main's Vite behaviour).
  // Source: node_modules policy, decision 7 (the reviews' `rs_2a`).
  test(
    'a marked app file matched by excludeFiles is denied',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/vendor/secret.ts': `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
            'src/entry.ts': `import { secret } from './vendor/secret'\nexport const read = () => secret()\n`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: { client: { excludeFiles: ['src/vendor/**'] } },
          },
        }),
      )
      expect(
        reportedViolations(error).map(({ importer }) => importer),
      ).toContainEqual(expect.stringMatching(/^src\/entry\.ts:1:/))
    },
    timeout,
  )

  // A file name is a convention of the app's scope, not a statement: an
  // unmarked `.server.js` imported inside a package or a workspace package
  // builds (as main's Vite build). The marker is the statement.
  // Source: node_modules policy, decision 10 (A).
  test.each<PackageLayout>(['npm', 'workspace'])(
    'an unmarked .server.js imported inside a package (%s layout) builds',
    async (layout) => {
      const lib = installPackage(layout, {
        name: 'name-lib',
        declaration: 'peer',
        files: {
          'index.js': `export { value } from './db.server.js'\n`,
          'db.server.js': `export const value = () => 'MARK_DB'\n`,
        },
      })
      const build = await buildStart({
        bundler,
        files: {
          ...lib.files,
          'src/entry.ts': `import { value } from 'name-lib'\nexport const read = () => value()\n`,
        },
        symlinks: lib.symlinks,
        packageJson: appManifest([lib]),
        entry: 'src/entry.ts',
      })
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_DB')
      expect(reportedViolations(build)).toEqual([])
    },
    timeout,
  )
})

// A bare import of a marked module is a statement that its code runs: it is
// a violation even where the app declares `"sideEffects": false` (the
// bundler would drop the import, and the marked module with it). A barrel
// that is itself marked and only re-exports stays as before (D-c).
// On main, Vite fails this build; Rsbuild builds.
// Source: node_modules policy, D-c (A); Astra's `barefalse`.
describe.each(startBundlers)(
  '%s build, the app free of side effects',
  (bundler) => {
    test(
      'a bare import of a server-only-marked module fails the build at the import',
      async () => {
        const error = await rejection(
          buildStart({
            bundler,
            files: {
              'src/secret.ts': `import '@tanstack/react-start/server-only'\n;(globalThis as any).secret = 'MARK_SECRET'\n`,
              'src/entry.ts': `import './secret'\nexport const read = () => 'MARK_READ'\n`,
            },
            entry: 'src/entry.ts',
            sideEffects: false,
          }),
        )
        expect(
          reportedViolations(error).map(({ importer }) => importer),
        ).toContainEqual(expect.stringMatching(/^src\/entry\.ts:1:/))
      },
      timeout,
    )
  },
)
