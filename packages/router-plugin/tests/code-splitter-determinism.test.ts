/**
 * Code splitting does not depend on where the project lives or on how the
 * platform spells paths: the same route compiles to the same modules under
 * any project root and with Windows module ids, and building the same app
 * twice, in two directories, emits the same files.
 */
import { describe, expect, test, vi } from 'vitest'
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
 * What the compiled route does, and its modules with the route file's id
 * (in any spelling) replaced by `<route>`.
 */
async function compileUnder(moduleId: string) {
  const loaded = await loadRoute(route, {
    moduleId,
    stubs: { './format': { format: (text: string) => `[${text}]` } },
  })
  const spellings = [
    ...new Set([moduleId, moduleId.replaceAll('\\', '/')]),
  ].sort((a, b) => b.length - a.length)
  const anonymous = (code: string) =>
    spellings.reduce((text, id) => text.replaceAll(id, '<route>'), code)
  const lazy: Array<string> = []
  for (const option of ['loader', 'component', 'errorComponent']) {
    if (await loaded.isLazy(option)) {
      lazy.push(option)
    }
  }
  return {
    lazy,
    rendered: [
      await (await loaded.load('loader'))(),
      await loaded.render('component'),
      await loaded.render('errorComponent'),
    ],
    modules: Object.fromEntries(
      Object.entries(loaded.modules).map(([label, code]) => [
        label,
        anonymous(code),
      ]),
    ),
  }
}

describe('a route compiled under', () => {
  test.each(Object.entries(moduleIds))(
    '%s splits the same way into the same modules',
    async (_, moduleId) => {
      const reference = await compileUnder('/app/src/routes/index.tsx')
      expect(reference.lazy).toEqual(['component', 'errorComponent'])
      expect(reference.rendered).toEqual([
        'MARK data',
        '<p>[MARK page]</p>',
        '<p>MARK failure</p>',
      ])
      expect(await compileUnder(moduleId)).toEqual(reference)
    },
  )
})
