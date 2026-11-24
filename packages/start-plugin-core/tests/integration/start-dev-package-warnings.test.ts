/**
 * The warning of an installed package that uses Start (node_modules policy,
 * decision 6) on a Vite dev server, whose dependency optimizer pre-bundles
 * the package: the compile sees the optimizer's bundle
 * (`node_modules/.vite/deps/…`), and the warning names the package the
 * Start use is in, with that package's remedy, never the optimizer's cache.
 * The client page loads the package through the optimizer, as an app's
 * page does.
 * Source: diagnostics spike (2026-11-24), inventory flag 1, agreed change
 * A1 (`pkg-undeclared`, `pkg-unreached` of the harness shapes).
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { appManifest, installPackage } from '../package-layouts'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import type { InstalledPackage, StartDeclaration } from '../package-layouts'

const timeout = 60_000

/** `name`, a package whose `index.js` makes a server fn builder. */
const usesStart = (name: string, declaration: StartDeclaration) =>
  installPackage('npm', {
    name,
    declaration,
    files: {
      'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn({ method: 'POST' })\n`,
    },
  })

/**
 * The warnings of a dev server whose client page imports `importAs`
 * (`packages` installed, `listed` in the app's manifest), after the page
 * loaded it.
 */
async function devWarnings(
  packages: ReadonlyArray<InstalledPackage>,
  listed: ReadonlyArray<InstalledPackage>,
  importAs: string,
) {
  const server = await startBrowserStartDevServer({
    files: {
      ...Object.assign({}, ...packages.map((p) => p.files)),
      'package.json': JSON.stringify(appManifest(listed)),
      'src/entry.ts': `import { base } from '${importAs}'\nexport const kind = () => typeof base\n`,
    },
  })
  const { result } = await runViteClient(
    server,
    '/src/entry.ts',
    'return entry.kind()',
  )
  expect(result).toBe('function')
  return {
    root: server.root,
    warnings: problems(server.diagnostics).filter(
      (d) => d.severity === 'warning',
    ),
  }
}

describe('vite dev, a pre-bundled package that uses Start', () => {
  test(
    "a package that does not declare Start: the warning names its module and its manifest, not the optimizer's cache",
    async () => {
      const lib = usesStart('fake-sfn', 'none')
      const { root, warnings } = await devWarnings([lib], [lib], 'fake-sfn')
      const named = findDiagnostics(warnings, {
        file: `${lib.directory}/index.js`,
        root,
      })
      expect(named).toHaveLength(1)
      expect(named[0]!.text).toContain(`${lib.directory}/package.json`)
      expect(named[0]!.text).toContain('as a peer dependency')
      expect(warnings.map((d) => d.text).join('\n')).not.toContain(
        'node_modules/.vite',
      )
    },
    timeout,
  )

  test(
    "a package that declares Start but the app does not list: the warning asks to list it in the app's dependencies",
    async () => {
      const lib = usesStart('fake-sfn', 'peer')
      const { root, warnings } = await devWarnings([lib], [], 'fake-sfn')
      const named = findDiagnostics(warnings, {
        file: `${lib.directory}/index.js`,
        root,
      })
      expect(named).toHaveLength(1)
      expect(named[0]!.text).toContain(
        "List fake-sfn in the app's dependencies",
      )
      expect(warnings.map((d) => d.text).join('\n')).not.toContain(
        'node_modules/.vite',
      )
    },
    timeout,
  )

  // The optimizer bundles a package's dependencies into its bundle: the
  // Start use is the inner package's, which the warning names; the package
  // the app imports uses no Start API.
  test(
    'a package the optimizer inlines into another package: the warning names the inner package',
    async () => {
      const inner = usesStart('inner-sfn', 'none')
      const outer = installPackage('npm', {
        name: 'outer-lib',
        manifest: { dependencies: { 'inner-sfn': '1.0.0' } },
        files: { 'index.js': `export { base } from 'inner-sfn'\n` },
      })
      const { root, warnings } = await devWarnings(
        [inner, outer],
        [outer],
        'outer-lib',
      )
      const named = findDiagnostics(warnings, {
        file: `${inner.directory}/index.js`,
        root,
      })
      expect(named).toHaveLength(1)
      expect(named[0]!.text).toContain(`${inner.directory}/package.json`)
      expect(warnings.map((d) => d.text).join('\n')).not.toMatch(
        /node_modules\/(?:\.vite|outer-lib)/,
      )
    },
    timeout,
  )
})
