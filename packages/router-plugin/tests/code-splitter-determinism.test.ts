/**
 * Code splitting does not depend on where the project lives or on how the
 * platform spells paths: the same route splits the same way and runs the
 * same under any project root and with Windows module ids (SPEC G4,
 * relocation: emitted code may differ, `@tanstack/compiler-test-utils/
 * determinism`). The slow tier builds the same app in two directories.
 */
import { describe, expect, test, vi } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import { head, loadRoute } from './regression-helpers'
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
  'another root': '/srv/apps/project/src/routes/index.tsx',
  'a deeper root':
    '/home/user/work/some/deep/monorepo/apps/web/src/routes/index.tsx',
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
