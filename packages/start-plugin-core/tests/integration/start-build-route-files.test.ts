/**
 * Route files a Start build compiles as routes once the generator has kept
 * them up, with their `server` options out of the client (SPEC J1.1, J2):
 * a constructor of the other kind whose id is not a string literal (the
 * generator repairs the constructor and reports the id; source:
 * REVIEW-design5-final finding 1, where the route was left for a repair
 * that never came and shipped its `server` code), and a route file that is
 * a symbolic link (bundlers resolve it to the file it links to; the
 * registry lists both paths).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000
const RP = '@tanstack/react-router'

const rootFile = `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`
const options = `{
  component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => new Response('MARK_SERVER') } },
}`
const app = (files: Record<string, string>) => ({
  'src/routes/__root.tsx': rootFile,
  'src/entry.ts': `export { routeTree } from './routeTree.gen'\n`,
  ...files,
})

describe.each(startBundlers)('a %s build', (bundler) => {
  test.each<{
    name: string
    file: string
    files: Record<string, string>
    wanted: string
  }>([
    {
      name: 'createLazyFileRoute in a route file',
      file: 'src/routes/x.tsx',
      files: {
        'src/routes/x.tsx': `import { createLazyFileRoute } from '${RP}'
const id = '/x'
export const Route = createLazyFileRoute(id as any)(${options} as any)
`,
      },
      wanted: 'createFileRoute',
    },
    {
      name: 'createFileRoute in a lazy route file',
      file: 'src/routes/x.lazy.tsx',
      files: {
        'src/routes/x.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/x')({ loader: () => 1 })
`,
        'src/routes/x.lazy.tsx': `import { createFileRoute } from '${RP}'
const id = '/x'
export const Route = createFileRoute(id as any)(${options} as any)
`,
      },
      wanted: 'createLazyFileRoute',
    },
  ])(
    '$name with an id that is not a string literal gets its constructor, and its server options stay out of the client',
    async ({ file, files, wanted }) => {
      const build = await buildStart({
        bundler,
        files: app(files),
        entry: 'src/entry.ts',
      })
      const written = await readFile(path.join(build.root, file), 'utf8')
      expect(written).toContain(`${wanted}(id as any)`)
      expect(build.client.where('MARK_SERVER')).toBe('nowhere')
      expect(build.client.where('MARK_PAGE')).toBe('lazy')
    },
    timeout,
  )

  test(
    'a route file that is a symbolic link is split, with its server options out of the client',
    async () => {
      const build = await buildStart({
        bundler,
        files: app({
          'linked/x.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/x')(${options})
`,
        }),
        symlinks: { 'src/routes/x.tsx': 'linked/x.tsx' },
        entry: 'src/entry.ts',
      })
      expect(build.client.where('MARK_SERVER')).toBe('nowhere')
      expect(build.client.where('MARK_PAGE')).toBe('lazy')
    },
    timeout,
  )
})
