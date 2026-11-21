/**
 * A standalone route file named like a route group (`(group).tsx`): route
 * groups are documented as directories only (routing/routing-concepts.md
 * :627-643, routing/file-naming-conventions.md:15), so this form is
 * undocumented and must never fail silently (SPEC §2.2, G5). Three outcomes
 * are acceptable:
 *
 * - a failed run naming the file;
 * - a warning or error naming the file, and a route tree the router loads;
 * - no diagnostic, and correct routing: the group adds no URL segment, its
 *   child index and the other pages render at their URLs.
 *
 * Which route (if any) `(group).tsx` becomes, and whether it wraps the
 * group's children, is not documented, so it is not required. No channel is
 * required either. Route group directories are tested in
 * real-router.test.ts and route-paths.test.ts.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator } from '../src'
import { configOf, createApp, fileRoute, rootRoute } from './app'
import { withRouteTree } from './route-tree'

/** A route file whose page renders `text`. */
function page(text: string) {
  return fileRoute('/', `{ component: () => ${JSON.stringify(text)} }`)
}

/**
 * Asserts the routing of an app with `about.tsx` and a group index at
 * `indexUrl`: no full path names the group, and each page renders at its
 * URL.
 */
async function expectGroupRouting(treeFile: string, indexUrl: string) {
  await withRouteTree(treeFile, async ({ router, renderAt }) => {
    expect(
      Object.values(router.routesById)
        .map((route) => route.fullPath)
        .filter((fullPath) => fullPath.includes('(group)')),
      'the full paths that name the group',
    ).toEqual([])
    expect(await renderAt('/about')).toContain('about page')
    expect(await renderAt(indexUrl)).toContain('group index page')
  })
}

/**
 * Generates an app with `files` (route files under `src/routes`, besides the
 * root route and `about.tsx`). Returns the app, its config, the error of a
 * failed run and the console diagnostics.
 */
async function generateApp(files: Record<string, string>) {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/about.tsx': page('about page'),
    ...Object.fromEntries(
      Object.entries(files).map(([file, code]) => [`src/routes/${file}`, code]),
    ),
  })
  const config = configOf(root, { disableLogging: false })
  const { result: error, diagnostics } = await captureDiagnostics(() =>
    new Generator({ config, root }).run().then(
      () => undefined,
      (e: unknown) => e as Error,
    ),
  )
  return { root, config, error, diagnostics }
}

describe('route files named like a route group', () => {
  const testCases = [
    { name: 'flat-flat', group: '(group).tsx', index: '(group).index.tsx' },
    { name: 'nested-flat', group: '(group).tsx', index: '(group)/index.tsx' },
    {
      name: 'flat-nested',
      group: 'nested/(group).tsx',
      index: 'nested/(group).index.tsx',
    },
    {
      name: 'nested-nested',
      group: 'nested/(group).tsx',
      index: 'nested/(group)/index.tsx',
    },
  ]

  // Bug: the generator rejects a `(group).tsx` route file with an error that
  // names the file relative to the routes directory (`(group).tsx`,
  // `nested/(group).tsx` for `src/routes/nested/(group).tsx`), neither
  // absolute nor project-relative (SPEC G5, §5.7: a diagnostic names the
  // file by its absolute or project-relative path); it neither warns with the file's name nor routes
  // the app.
  // Source: src/filesystem/physical/getRouteNodes.ts (the "route
  // configuration for a route group" error interpolates `filePath`, the
  // path under `routesDirectory`).
  // Impact: the failed run names a path that does not open from the project
  // root (`(group).tsx` is `src/routes/(group).tsx`), so the user has to
  // guess where the file to rename is. Low: diagnostics only.
  it.each(testCases)(
    'a (group).tsx route file is reported by name or routes correctly: $name',
    async ({ group, index }) => {
      const { root, config, error, diagnostics } = await generateApp({
        [group]: page('group layout'),
        [index]: page('group index page'),
      })
      const file = path.join('src/routes', group)
      if (error) {
        expectDiagnostic(error, { file, root })
        return
      }
      const reported = findDiagnostics(diagnostics, {
        severity: ['error', 'warning'],
        file,
        root,
      })
      if (reported.length > 0) {
        await withRouteTree(config.generatedRouteTree, () => {})
        return
      }
      await expectGroupRouting(
        config.generatedRouteTree,
        group.startsWith('nested/') ? '/nested/' : '/',
      )
    },
  )

  // (control: the routing check accepts the documented group directory)
  it('a route group directory routes correctly', async () => {
    const { config, error, diagnostics } = await generateApp({
      '(group)/index.tsx': page('group index page'),
    })
    expect(error).toBeUndefined()
    expect(
      diagnostics.filter((diagnostic) => diagnostic.severity !== 'info'),
    ).toEqual([])
    await expectGroupRouting(config.generatedRouteTree, '/')
  })
})
