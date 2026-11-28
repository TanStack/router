/**
 * Which installed packages Start's Vite plugin bundles for the server
 * (`ssr.noExternal`) and leaves to Vite in development
 * (`optimizeDeps.exclude`): those that declare Start, found from the app's
 * manifest through Start packages, workspace packages and installed
 * optional dependencies, by the name the importer wrote (node_modules
 * policy, decision 5). Observed in real Vite builds: a package the server
 * bundles has its source, compiled, in the server output, and its server
 * fn answers; an external one is imported by Node at run time.
 *
 * A Start package behind an ordinary installed parent stays behind it
 * (the parent is external): the client build, which compiles it, warns
 * (decision 6, case ii).
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { callByIdExports, callByIdPrelude } from '../build-harness'
import { buildStart } from '../build-start'
import { appManifest, installPackage } from '../package-layouts'
import type { InstalledPackage } from '../package-layouts'

/** A Start package `name` whose server fn `ping` answers `MARK_<tag>`. */
const startPackage = (name: string, tag: string) => ({
  name,
  declaration: 'peer' as const,
  files: {
    'index.js': `import { createServerFn } from '@tanstack/react-start'
export const ping = createServerFn().handler(async () => 'MARK_${tag}')
`,
  },
})

/** Builds an app whose server entry calls `ping` of each of `imports`. */
async function serverOf(
  packages: ReadonlyArray<InstalledPackage>,
  imports: Record<string, string>,
  extra: {
    files?: Record<string, string>
    manifest?: Record<string, unknown>
  } = {},
) {
  const names = Object.keys(imports)
  const fns = `${names.map((n) => `import { ping as ${n} } from '${imports[n]}'`).join('\n')}
export const pings = { ${names.join(', ')} }
`
  return buildStart({
    files: {
      ...Object.assign({}, ...packages.map((p) => p.files)),
      ...extra.files,
      'src/fns.ts': fns,
      'src/entry.ts': `import { pings } from './fns'\nexport const kinds = () => Object.keys(pings)\n`,
      'src/ssr-entry.ts': `export { pings } from './fns'\n${callByIdExports}`,
    },
    symlinks: Object.assign({}, ...packages.map((p) => p.symlinks)),
    packageJson: appManifest(packages, extra.manifest),
    entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
  })
}

/** What each server fn of `pings` answers, called by id from the server. */
const answers = `${callByIdPrelude}const out = {}
for (const [name, fn] of Object.entries(entry.pings)) {
  out[name] = await callById(serverFnId(fn))
}
return out`

describe('vite build', () => {
  // Before the policy, vitefu's crawl listed an alias by its package's
  // manifest name, which Vite does not match: the package stayed external.
  // Source: Astra's review of the policy, A-H4a (`alias`, two aliases).
  test('two npm aliases of one package and a direct dependency are bundled for the server, and their server fns answer', async () => {
    const lib = installPackage('alias', startPackage('lib-a', 'A'))
    const second = {
      ...lib,
      files: {},
      dependency: { 'lib-a-second': 'npm:lib-a@1.0.0' },
      symlinks: { 'node_modules/lib-a-second': lib.directory },
    }
    const direct = installPackage('npm', startPackage('lib-b', 'B'))
    const build = await serverOf([lib, second, direct], {
      a: lib.importAs,
      second: 'lib-a-second',
      b: direct.importAs,
    })
    expect(build.ssr.where('MARK_A')).not.toBe('nowhere')
    expect(build.ssr.where('MARK_B')).not.toBe('nowhere')
    expect((await build.ssr.run(answers)).result).toEqual({
      a: 'MARK_A',
      second: 'MARK_A',
      b: 'MARK_B',
    })
  })

  // pnpm installs an alias as a link to the package's own directory in its
  // store: the module's directory is named after the package, the
  // dependency after the alias. The package Start found is that instance,
  // whatever its directory is called: no "not found" warning.
  // Source: reviews of the node_modules policy implementation (Astra 4
  // `head-vite-alias`, Gemini F3).
  test('a pnpm alias of a Start package is bundled for the server, its server fn answers, nothing is reported', async () => {
    const store = 'node_modules/.pnpm/lib-p@1.0.0/node_modules/lib-p'
    const lib = {
      files: Object.fromEntries(
        Object.entries(
          installPackage('npm', startPackage('lib-p', 'P')).files,
        ).map(([file, code]) => [
          file.replace('node_modules/lib-p', store),
          code,
        ]),
      ),
      symlinks: { 'node_modules/lib-p-alias': store },
      dependency: { 'lib-p-alias': 'npm:lib-p@1.0.0' },
      importAs: 'lib-p-alias',
      directory: store,
    }
    const build = await serverOf([lib], { p: 'lib-p-alias' })
    expect((await build.ssr.run(answers)).result).toEqual({ p: 'MARK_P' })
    expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
  })

  // Source: Astra's and Gemini's reviews of the policy, A-M1 and G-M1
  // (`optional-edge`), and Gemini's monorepo case (a Start package behind a
  // workspace package, external in SSR before).
  test('an installed optional dependency and a Start package behind a workspace package are bundled for the server', async () => {
    const optional = installPackage('npm', startPackage('lib-opt', 'OPT'))
    const behind = installPackage('npm', startPackage('lib-behind', 'BEHIND'))
    const ws = installPackage('workspace', {
      name: 'ws-lib',
      manifest: { dependencies: { 'lib-behind': '1.0.0' } },
      files: { 'index.js': `export { ping } from 'lib-behind'\n` },
    })
    const build = await serverOf(
      [optional, ws],
      { opt: 'lib-opt', ws: 'ws-lib' },
      {
        files: { ...optional.files, ...behind.files },
        manifest: {
          dependencies: { '@tanstack/react-start': '*', 'ws-lib': '1.0.0' },
          optionalDependencies: { 'lib-opt': '1.0.0' },
        },
      },
    )
    expect(build.ssr.where('MARK_OPT')).not.toBe('nowhere')
    expect(build.ssr.where('MARK_BEHIND')).not.toBe('nowhere')
    expect((await build.ssr.run(answers)).result).toEqual({
      opt: 'MARK_OPT',
      ws: 'MARK_BEHIND',
    })
  })

  // The documented limit: Vite keeps an ordinary installed package
  // external on the server, and a Start package behind it with it. The
  // client build, which bundles the parent and compiles the Start package,
  // warns at the Start package's module.
  // Source: Astra's review of the policy, A-H4b; decision 6 (A, case ii).
  test('a Start package behind an ordinary installed parent: the client build warns at its module', async () => {
    const leaf = installPackage('npm', startPackage('lib-leaf', 'LEAF'))
    const parent = installPackage('npm', {
      name: 'plain-parent',
      manifest: { dependencies: { 'lib-leaf': '1.0.0' } },
      files: { 'index.js': `export { ping } from 'lib-leaf'\n` },
    })
    const build = await serverOf(
      [parent],
      { leaf: 'plain-parent' },
      { files: leaf.files },
    )
    expectDiagnostic(problems(build.diagnostics), {
      severity: 'warning',
      file: `${leaf.directory}/index.js`,
      root: build.root,
    })
  })
})
