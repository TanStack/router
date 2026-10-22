/**
 * Code splitting does not depend on where the project lives: the same route
 * splits the same way and runs the same under any project root (SPEC G4,
 * relocation: emitted code may differ, `@tanstack/compiler-test-utils/
 * determinism`). Each root is a real app directory served by its own dev
 * server (`./route-app`), observed in a real browser page. The slow tier
 * builds the same app in two directories. Windows module ids are platform
 * evidence for a Windows run (N24).
 */
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { expectRelocatable } from '@tanstack/compiler-test-utils/determinism'
import { head, loadRoute } from '../../route-app'

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

/** Directory of the other project roots of this file, removed after it. */
const rootsDir = path.join(import.meta.dirname, '.relocation-roots')
afterAll(() => {
  rmSync(rootsDir, { recursive: true, force: true })
})

/** Project roots the same route file is served from (directories the app is created in). */
const roots: Record<string, string> = {
  reference: import.meta.dirname,
  'another root': path.join(rootsDir, 'srv/apps/project/src'),
  'a deeper root': path.join(
    rootsDir,
    'home/user/work/some/deep/monorepo/apps/web/src',
  ),
}

/**
 * What the route served from the root `name` does (SPEC G4: semantics, not
 * bytes): the options that load lazily and how they group, the loader's
 * data and the rendered components. Its emitted code and generated names
 * are free to differ between roots.
 */
async function serveUnder(name: string) {
  const dir = roots[name]!
  mkdirSync(dir, { recursive: true })
  const loaded = await loadRoute(route, {
    dir,
    fresh: true,
    files: {
      'format.ts': `export const format = (text: string) => \`[\${text}]\`\n`,
    },
  })
  return {
    groups: await loaded.groups(),
    rendered: await loaded.run(`return [
  await (await load('loader'))(),
  await render('component'),
  await render('errorComponent'),
]`),
  }
}

const reference = {
  groups: [['component'], ['errorComponent']],
  rendered: ['MARK data', '<p>[MARK page]</p>', '<p>MARK failure</p>'],
}

describe('a route served under', () => {
  test.each(['another root', 'a deeper root'])(
    '%s splits and runs as under the reference root',
    async (name) => {
      await expectRelocatable(['reference', name], serveUnder, {
        check: (observation) => expect(observation).toEqual(reference),
        portable: (observation) => observation,
      })
    },
    // Two dev servers of their own
    30_000,
  )
})
