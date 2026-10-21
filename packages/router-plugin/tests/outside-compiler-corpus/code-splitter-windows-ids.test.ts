/**
 * Not part of the compiler test corpus (platform emulation, N24): the same
 * route compiled under Windows module ids (`C:/…` from Vite, `C:\\…` from
 * webpack and Rspack) by the legacy in-process host, with Node's file URL
 * helpers mocked to behave as on Windows. No public reproduction runs a
 * Windows path on this platform; the evidence that counts is a Windows run
 * of the corpus. The corpus checks relocation across real project roots:
 * code-splitter-determinism.test.ts. Moved there from that file
 * (B1 repair), rows unchanged.
 */
import { describe, expect, test, vi } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import { head, loadRoute } from '../regression-helpers'
import type * as NodeUrl from 'node:url'

const route = `${head}import { format } from './format'
const prefix = 'MARK'
function Page() {
  return <p>{format(prefix + ' page')}</p>
}
function Failure() {
  return <p>{prefix} failure</p>
}
export const Route = createFileRoute('/')({
  loader: () => prefix + ' data',
  errorComponent: Failure,
  component: Page,
})
`

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

/** Module ids of the same route file, as bundlers pass them. */
const moduleIds = {
  'Windows (Vite)': 'C:/Users/me/app/src/routes/index.tsx',
  'Windows (webpack, Rspack)': 'C:\\Users\\me\\app\\src\\routes\\index.tsx',
}

/**
 * What the route compiled under `moduleId` does (SPEC G4: semantics, not
 * bytes): the options that load lazily and how they group, the loader's
 * data and the rendered components. Its emitted code and generated names
 * are free to differ between roots.
 */
async function compileUnder(moduleId: string) {
  const loaded = await loadRoute(route, {
    moduleId,
    stubs: { './format': { format: (text: string) => `[${text}]` } },
  })
  return {
    groups: await loaded.groups(),
    rendered: [
      await (await loaded.load('loader'))(),
      await loaded.render('component'),
      await loaded.render('errorComponent'),
    ],
  }
}

const reference = {
  groups: [['component'], ['errorComponent']],
  rendered: ['MARK data', '<p>[MARK page]</p>', '<p>MARK failure</p>'],
}

describe('a route compiled under', () => {
  test.each(Object.entries(moduleIds))(
    '%s splits and runs as under the reference root',
    async (_, moduleId) => {
      await expectRelocatable(
        ['/app/src/routes/index.tsx', moduleId],
        compileUnder,
        {
          check: (observation) => expect(observation).toEqual(reference),
          portable: (observation) => observation,
        },
      )
    },
  )
})
