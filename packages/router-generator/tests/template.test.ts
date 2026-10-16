import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { Generator, getConfig } from '../src'
import type { Config } from '../src'

/** The string the route call of a route file creates its route with. */
function routeIdInFile(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  const ids: Array<unknown> = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') {
      return
    }
    const record = node as Record<string, any>
    if (
      record.type === 'CallExpression' &&
      record.callee?.type === 'Identifier' &&
      /^create(?:Lazy)?FileRoute$/.test(record.callee.name)
    ) {
      ids.push(record.arguments[0]?.value)
    }
    Object.values(record).forEach(visit)
  }
  visit(program)
  expect(ids).toHaveLength(1)
  return ids[0]
}

/**
 * Runs the generator for `target` on an app whose route files with quotes
 * in their paths are empty, and returns the route ids the files it writes
 * create their routes with.
 */
async function scaffoldQuotedRoutes(target: Config['target']) {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-template-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute()`,
    )
    const files = ['say-"hi".tsx', 'later-"x".lazy.tsx']
    for (const file of files) {
      await writeFile(path.join(root, 'routes', file), '')
    }
    const config = getConfig({
      target,
      disableLogging: true,
      routesDirectory: path.join(root, 'routes'),
      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
      // Same filesystem as the app, so the generator can rename its temp files
      tmpDir: path.join(root, '.tanstack/tmp'),
    })
    await new Generator({ config, root }).run()
    const ids: Array<unknown> = []
    for (const file of files) {
      ids.push(
        routeIdInFile(await readFile(path.join(root, 'routes', file), 'utf8')),
      )
    }
    return ids
  } finally {
    log.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
}

// A new, empty route file gets a route scaffolded from the target's
// template, with the route path as written in a string literal, quotes
// included.
describe('route templates', () => {
  it.each(['react', 'solid'] as const)(
    'scaffold %s routes whose paths contain quotes',
    async (target) => {
      expect(await scaffoldQuotedRoutes(target)).toEqual([
        '/say-"hi"',
        '/later-"x"',
      ])
    },
  )

  // Bug: the Vue route templates put the route path into the component's
  // string literal unescaped (`h("div", {}, "Hello \"%%tsrPath%%\"!")`),
  // where the React and Solid ones put it into JSX text, so a path with a
  // `"` ends the string. Source: round-2 rewrite of the template tests,
  // which only checked the escaped route id.
  // Impact: route generation fails for a new, empty Vue route file whose
  // path contains a double quote.
  it.fails('scaffold vue routes whose paths contain quotes', async () => {
    expect(await scaffoldQuotedRoutes('vue')).toEqual([
      '/say-"hi"',
      '/later-"x"',
    ])
  })
})
