/**
 * Failing regression tests for High & Medium bugs found during review of PR #8817
 * in `@tanstack/router-generator`.
 */
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator, getConfig } from '../src'
import { createApp, generate, read, rootRoute } from './app'
import { routesOf } from './route-tree'

describe('PR #8817 review regressions in @tanstack/router-generator', () => {
  test('does not corrupt a template-literal route ID without an options call', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute(\`/old\`)
`,
    })
    await generate(root)
    const written = await read(root, 'src/routes/posts.tsx')
    expect(written).not.toContain('(`/old`)')
    expect(written).toContain("createFileRoute('/posts')")
  })

  test('does not emit invalid numeric-leading identifiers when deduplicating empty variableNames', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/_.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/_')({})
`,
      'src/routes/_._.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/_/_')({})
`,
    })
    const { generatedRouteTree } = await generate(root)
    const tree = await read(root, 'src/routeTree.gen.ts')
    expect(tree).not.toMatch(/\bas 2RouteImport\b/)
    expect(await routesOf(generatedRouteTree)).toBeDefined()
  })

  test('scaffolds an empty Vue __root.vue as a valid Vue SFC with a <script> block', async () => {
    const root = await createApp({
      'src/routes/__root.vue': '',
    })
    await generate(root, { target: 'vue' })
    const written = await read(root, 'src/routes/__root.vue')
    expect(written).toMatch(/<script\b/)
  })

  test('scaffolds a route file recreated empty after deletion (digestOf("") collision)', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({})
`,
    })
    const config = getConfig(
      {
        routesDirectory: path.join(root, 'src/routes'),
        generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
        disableLogging: true,
      },
      root,
    )
    const generator = new Generator({ config, root })
    await generator.run()

    const aboutFile = path.join(root, 'src/routes/about.tsx')
    await unlink(aboutFile)
    // An update event arriving after the file already vanished stores the empty-digest sentinel.
    await generator.run({ type: 'update', path: aboutFile })

    // Recreating the file empty must scaffold and re-include it.
    await writeFile(aboutFile, '')
    await generator.run({ type: 'update', path: aboutFile })

    const written = await read(root, 'src/routes/about.tsx')
    expect(written).toContain("createFileRoute('/about')")
  })

  test('warns when `export function Route()` wraps createFileRoute instead of silent foreign:other', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/wrapped.tsx': `import { createFileRoute } from '@tanstack/react-router'
export function Route() {
  return createFileRoute('/wrapped')({})
}
`,
    })
    const { diagnostics } = await captureDiagnostics(async () => {
      await generate(root, { disableLogging: false })
    })
    expect(diagnostics.length).toBeGreaterThan(0)
  })
})
