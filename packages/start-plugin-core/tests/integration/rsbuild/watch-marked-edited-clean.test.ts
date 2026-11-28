/**
 * Start's Rsbuild `build --watch`, a server-only marked module edited clean
 * (H3): what its marked compile left (import protection's record) goes with
 * the clean compile, in an app's own file and in a watched package module
 * the compiler no longer reads (rule 1 of the Rsbuild host).
 * Source: hotspot 3 cross-review rows (review-hotspot3-fable-on-gemini.md,
 * H3).
 */
import { describe, expect, test } from 'vitest'
import { callByIdExports } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest, installPackage } from '../../package-layouts'
import { rsbuildEntries } from '../route-css-cases'

const root = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
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
`

describe('rsbuild build --watch: a marked app file edited clean', () => {
  // H3 in an app's own file (Gemini's probe edits an installed package with
  // `watchOptions.ignored: []` and `managedPaths: []`).
  test('the marker is removed in a watch rebuild: no import-protection report', async () => {
    const watched = await buildStart({
      bundler: 'rsbuild',
      start: { importProtection: { behavior: 'mock' } },
      files: {
        ...rsbuildEntries,
        'src/routes/__root.tsx': root,
        'src/secret.ts': `import '@tanstack/react-start/server-only'\nexport const secret = 'MARK_SECRET'\n`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret'
export const Route = createFileRoute('/')({
  component: () => <p>{secret}</p>,
})
`,
      },
      watchEdits: [
        {
          edits: { 'src/secret.ts': `export const secret = 'MARK_CLEAN'\n` },
        },
      ],
    })
    expect(watched.violations).toEqual([])
    // (the build's own report of a violation, in either compilation)
    expect(
      watched.diagnostics.filter(
        (d) => d.severity !== 'info' && JSON.stringify(d).includes('secret.ts'),
      ),
    ).toEqual([])
  })
})

/** `marked-lib`, an installed package whose module is server-only by its marker. */
const markedLib = installPackage('npm', {
  name: 'marked-lib',
  files: {
    'a.js': `import '@tanstack/react-start/server-only'\nexport const a = 'MARK_LIB_SERVER'\n`,
    // (the importer is the package's own module, which the compiler does
    // not read: the marked module is its own violation)
    'index.js': `export { a } from './a.js'\n`,
  },
})

describe('rsbuild build --watch: a marked package module edited clean', () => {
  // H3. The package's directory is watched and unmanaged (a linked or
  // deliberately watched dependency). The clean module is no longer
  // compiled (its text names nothing of Start): what its marked compile left
  // must go with it.
  test('the marker is removed in a watch rebuild: no violation is reported for the clean module', async () => {
    const watched = await buildStart({
      bundler: 'rsbuild',
      start: { importProtection: { behavior: 'mock' } },
      files: {
        ...markedLib.files,
        'src/entry.ts': `export { a } from 'marked-lib/index.js'\n`,
        'src/ssr-entry.ts': `export { a } from 'marked-lib/index.js'\n${callByIdExports}`,
      },
      packageJson: appManifest([markedLib]),
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: {
        tools: {
          rspack: (config: { watchOptions?: object; snapshot?: object }) => {
            config.watchOptions = {
              ...config.watchOptions,
              ignored: /[\\/](?:\.git|node_modules[\\/](?!marked-lib[\\/]))/,
            }
            config.snapshot = { ...config.snapshot, managedPaths: [] }
          },
        },
      },
      watchEdits: [
        {
          edits: {
            [`${markedLib.directory}/a.js`]: `export const a = 'MARK_LIB_CLEAN'\n`,
          },
        },
      ],
    })
    expect(watched.violations).toEqual([])
    // (the build's own report of a violation, in either compilation)
    expect(
      watched.diagnostics.filter(
        (d) =>
          d.severity !== 'info' && JSON.stringify(d).includes('marked-lib'),
      ),
    ).toEqual([])
    expect(
      watched.client.locate('MARK_LIB_CLEAN').eager.length,
    ).toBeGreaterThan(0)
  })
})
