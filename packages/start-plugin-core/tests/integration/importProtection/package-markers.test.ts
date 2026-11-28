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
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest, installPackage } from '../../package-layouts'
import {
  rejection,
  reportedViolations,
  violationsOf,
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
    // (also a file both marked and named `*.server.*`: the name's rule
    // must not hide what the marker says of the bare import; Astra's and
    // Gemini's reviews of the implementation, `head-vite-both`, F4)
    test.each(['secret', 'secret.server'])(
      'a bare import of a server-only-marked module (%s.ts) fails the build at the import',
      async (name) => {
        const error = await rejection(
          buildStart({
            bundler,
            files: {
              [`src/${name}.ts`]: `import '@tanstack/react-start/server-only'\n;(globalThis as any).secret = 'MARK_SECRET'\n`,
              'src/entry.ts': `import './${name}'\nexport const read = () => 'MARK_READ'\n`,
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

// A package under the source directory (`src/node_modules`) is in the
// scope: its imports are checked by the specifier rules on Vite as on
// Rsbuild (Vite's dependency filter let only Start text through).
// Source: node_modules policy, step 4.
describe.each(startBundlers)('%s build, a package in the scope', (bundler) => {
  test(
    'a specifier rule denies the import of a package under src/node_modules',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'node_modules/secret-sdk/package.json': JSON.stringify({
              name: 'secret-sdk',
              type: 'module',
              exports: { '.': './index.js' },
            }),
            'node_modules/secret-sdk/index.js': `export const sdk = () => 'MARK_SDK'\n`,
            'src/node_modules/vendored/package.json': JSON.stringify({
              name: 'vendored',
              type: 'module',
              exports: { '.': './index.js' },
            }),
            'src/node_modules/vendored/index.js': `import { sdk } from 'secret-sdk'\nexport const read = () => sdk()\n`,
            'src/entry.ts': `import { read } from 'vendored'\nexport { read }\n`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: { client: { specifiers: ['secret-sdk'] } },
          },
        }),
      )
      expect(
        reportedViolations(error).map(({ importer }) => importer),
      ).toContainEqual(
        expect.stringMatching(/^src\/node_modules\/vendored\/index\.js:1:/),
      )
    },
    timeout,
  )
})

// An exemption's pattern matches a package hoisted above the app's root
// (a monorepo's `node_modules`) as the public matcher does, by its
// absolute path: the exempt barrel is compiled, so its marked module is
// the real one, with nothing reported.
// On main, Vite fails on the marker and Rsbuild gives the real module;
// before the policy, the PR gave the real module on both hosts.
// Source: reviews of the node_modules policy implementation (Astra 2
// `head-vite-grant-outer`, Gemini F2).
describe.each(startBundlers)('%s build, a hoisted package', (bundler) => {
  test.each<[string, ImportProtectionOptions]>([
    ['ignoreImporters', { ignoreImporters: ['**/ui-kit/index.js'] }],
    ['exclude', { exclude: ['**/ui-kit/index.js'] }],
  ])(
    'the barrel listed in %s gets the real module, nothing reported',
    async (_, importProtection) => {
      const build = await buildStart({
        bundler,
        workspace: {
          app: 'repo/apps/web',
          files: {
            'repo/package.json': JSON.stringify({
              name: 'monorepo',
              private: true,
            }),
            'repo/node_modules/ui-kit/package.json': JSON.stringify({
              name: 'ui-kit',
              type: 'module',
              exports: { '.': './index.js' },
            }),
            'repo/node_modules/ui-kit/index.js': `export { secret } from './secret.js'\n`,
            'repo/node_modules/ui-kit/secret.js': `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
          },
        },
        packageJson: {
          name: 'web',
          private: true,
          type: 'module',
          dependencies: { 'ui-kit': '*' },
        },
        files: {
          'src/entry.ts': `import { secret } from 'ui-kit'\nexport const read = () => secret()\n`,
        },
        entry: 'src/entry.ts',
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
})

// A package module the compiler does not compile, importing a marked
// package by its bare or scoped name (the other package's export map
// points at the marked file): the report locates the import on its line,
// with the specifier as written.
// Source: reviews of the node_modules policy implementation (Astra 6
// `head-vite-bare-location`, Gemini F5).
describe.each(startBundlers)(
  '%s build, a package importing a marked package',
  (bundler) => {
    test.each(['secret-lib', '@acme/secret-lib'])(
      'by %s: the report is at the import, with its specifier',
      async (name) => {
        const marked = {
          [`node_modules/${name}/package.json`]: JSON.stringify({
            name,
            type: 'module',
            exports: { '.': './entry.js' },
          }),
          [`node_modules/${name}/entry.js`]: `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
        }
        const error = await rejection(
          buildStart({
            bundler,
            files: {
              ...marked,
              'node_modules/wrapper-lib/package.json': JSON.stringify({
                name: 'wrapper-lib',
                type: 'module',
                exports: { '.': './index.js' },
              }),
              // (a comment naming the package is no import)
              'node_modules/wrapper-lib/index.js': `// re-exports '${name}'\nexport const VERSION = '1'\nexport { secret } from '${name}'\n`,
              'src/entry.ts': `import { secret } from 'wrapper-lib'\nexport const read = () => secret()\n`,
            },
            entry: 'src/entry.ts',
          }),
        )
        const reported = violationsOf(error)
        expect(reported).not.toEqual([])
        for (const v of reported) {
          expect(v.importer).toMatch(/^node_modules\/wrapper-lib\/index\.js:3:/)
          expect(v.specifier).toBe(name)
        }
      },
      timeout,
    )
  },
)

// The id filter Vite's hook runs before the compile scope must let through
// every module the public matcher exempts: a pattern it cannot say as an id
// filter (a whole-pattern negation) lets every dependency script through,
// and an empty pattern, which matches no path, is no error.
// Source: round-2 re-checks of the node_modules policy implementation
// (Astra 2 `glob-negation`, Gemini 4); round 3 (Astra 1 `prefix-negation`,
// `prefix-positive`).
describe.each(startBundlers)('%s build, exemption patterns', (bundler) => {
  const app = (ignoreImporters: Array<string>) =>
    buildStart({
      bundler,
      workspace: {
        app: 'repo/apps/web',
        files: {
          'repo/package.json': JSON.stringify({
            name: 'monorepo',
            private: true,
          }),
        },
      },
      files: {
        'node_modules/ui-kit/package.json': JSON.stringify({
          name: 'ui-kit',
          type: 'module',
          exports: { '.': './index.js' },
        }),
        'node_modules/ui-kit/index.js': `export { secret } from './secret.js'\n`,
        'node_modules/ui-kit/secret.js': `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
        'src/entry.ts': `import { secret } from 'ui-kit'\nexport const read = () => secret()\n`,
      },
      packageJson: {
        name: 'web',
        private: true,
        type: 'module',
        dependencies: { 'ui-kit': '*' },
      },
      entry: 'src/entry.ts',
      start: { importProtection: { ignoreImporters } },
    })

  // (`./` before the negation, and twice: picomatch reads both as their
  // root-relative pattern; round-3 re-checks, Astra 1, Fable N4, Gemini 4)
  test.each([
    '!**/apps/web/**',
    './!**/apps/web/**',
    '././node_modules/ui-kit/**',
  ])(
    "%s exempts the package's barrel: the real module, nothing reported",
    async (pattern) => {
      const build = await app([pattern])
      expect(
        (await build.client.run(`return String(entry.read())`)).result,
      ).toBe('MARK_SECRET')
      expect(reportedViolations(build)).toEqual([])
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  test(
    'an empty pattern exempts nothing: the build fails at the barrel',
    async () => {
      const error = await rejection(app(['']))
      const reported = reportedViolations(error)
      expect(reported).not.toEqual([])
      for (const { importer } of reported) {
        expect(importer).toMatch(/^node_modules\/ui-kit\/index\.js:1:/)
      }
    },
    timeout,
  )
})
