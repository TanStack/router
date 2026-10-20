/**
 * Not part of the compiler test corpus (implementation control: SPEC G4
 * frees emitted code across project roots; the corpus checks relocation by
 * what the route does, `code-splitter-determinism.test.ts`).
 *
 * The current code splitter emits the same modules for the same route file
 * under any project root and with Windows module ids, once the route file's
 * own id is replaced by `<route>`. A rewrite may legitimately fail this.
 */
import { describe, expect, test, vi } from 'vitest'
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
  'another root': '/srv/apps/project/src/routes/index.tsx',
  'a deeper root':
    '/home/user/work/some/deep/monorepo/apps/web/src/routes/index.tsx',
  'Windows (Vite)': 'C:/Users/me/app/src/routes/index.tsx',
  'Windows (webpack, Rspack)': 'C:\\Users\\me\\app\\src\\routes\\index.tsx',
}

/** The emitted modules, with the route file's id (any spelling) as `<route>`. */
async function modulesUnder(moduleId: string) {
  const loaded = await loadRoute(route, {
    moduleId,
    stubs: { './format': { format: (text: string) => `[${text}]` } },
  })
  const spellings = [
    ...new Set([moduleId, moduleId.replaceAll('\\', '/')]),
  ].sort((a, b) => b.length - a.length)
  const anonymous = (code: string) =>
    spellings.reduce((text, id) => text.replaceAll(id, '<route>'), code)
  return Object.fromEntries(
    Object.entries(loaded.modules).map(([label, code]) => [
      label,
      anonymous(code),
    ]),
  )
}

describe('the current code splitter emits, for a route compiled under', () => {
  test.each(Object.entries(moduleIds))(
    '%s, the modules it emits under the reference root',
    async (_, moduleId) => {
      const reference = await modulesUnder('/app/src/routes/index.tsx')
      expect(Object.keys(reference).length).toBeGreaterThan(1)
      expect(await modulesUnder(moduleId)).toEqual(reference)
    },
  )
})
