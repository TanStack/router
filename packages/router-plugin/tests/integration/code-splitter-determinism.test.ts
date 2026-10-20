// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../code-splitter-determinism.test.ts (fast tier).
/**
 * Code splitting does not depend on where the project lives (SPEC G4,
 * relocation): the same app built in two directories (its files written in
 * another order) splits the same way and runs the same in a browser. Each
 * build must work on its own; emitted files, chunk names and bytes are free
 * to differ (`@tanstack/compiler-test-utils/determinism`).
 */
import { expect, test, vi } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
import type * as NodeUrl from 'node:url'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

// Node's file URL helpers follow the host platform. For Windows paths
// (drive letter first) they behave here as they do on Windows; other paths
// are unaffected.
vi.mock('node:url', async (importOriginal) => {
  const url = await importOriginal<typeof NodeUrl>()
  const windowsPath = /^[A-Za-z]:[\\/]/
  return {
    ...url,
    pathToFileURL: (file: string, options?: { windows?: boolean }) =>
      url.pathToFileURL(file, {
        ...options,
        windows: options?.windows ?? windowsPath.test(file),
      }),
    fileURLToPath: (href: string | URL, options?: { windows?: boolean }) =>
      url.fileURLToPath(href, {
        ...options,
        windows:
          options?.windows ??
          /^\/[A-Za-z]:\//.test(new URL(String(href)).pathname),
      }),
  }
})

const appFiles = routeApp(
  `${head}import { format } from '../format'
function Page() {
  return <p>{format('MARK_PAGE')}</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_DATA',
  errorComponent: Failure,
  component: Page,
})
`,
  {
    env: 'client',
    files: {
      'format.ts': 'export const format = (text: string) => `[${text}]`\n',
    },
  },
)

/**
 * Builds the app in a directory named after `prefix` and runs it in a
 * browser: the loader's data, the mounted page, and whether each option's
 * code ships with the entry or on demand.
 */
async function buildIn(bundler: Bundler, prefix: string) {
  const files = Object.entries(appFiles)
  const app = await build({
    bundler,
    env: 'client',
    prefix,
    // Write the files in another order at the second root
    files: Object.fromEntries(prefix === prefixes[1] ? files.reverse() : files),
  })
  const run = await app.run(`const data = await entry.Route.options.loader()
await entry.mount(entry.Route.options.component)
return data`)
  return {
    data: run.result,
    html: run.html,
    placement: {
      page: app.where('MARK_PAGE'),
      failure: app.where('MARK_FAILURE'),
      data: app.where('MARK_DATA'),
    },
  }
}

const prefixes = ['.determinism-a-', '.determinism-another-longer-directory-']

test.each(['vite', 'rspack', 'webpack'] as const)(
  'the same app built in two directories splits and runs the same (%s)',
  async (bundler) => {
    await expectRelocatable(prefixes, (prefix) => buildIn(bundler, prefix), {
      check: (observation) => {
        expect(observation.data).toBe('MARK_DATA')
        expect(observation.html).toContain('[MARK_PAGE]')
        expect(observation.placement.page).toBe('lazy')
        expect(observation.placement.failure).toBe('lazy')
      },
      portable: (observation) => observation,
    })
  },
  120_000,
)
