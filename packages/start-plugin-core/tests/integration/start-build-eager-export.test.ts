/**
 * An exported component of a route file only its split component renders
 * loads with the route's chunk in a Start client build (the chunk carries
 * its copy; the module the route module re-exports it from is dropped,
 * R77). When a module loaded with the entry imports it through the route
 * file (here the app's router module), the bundler keeps that module with
 * the entry: the build warns once, naming the route file, on Vite and on
 * Rsbuild (SPEC J2.8; the router plugin's hosts do the same).
 */
import { describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 120_000

const route = `import { createFileRoute } from '@tanstack/react-router'
export function Card() {
  return <b>MARK_CARD</b>
}
function Page() {
  return <Card />
}
export const Route = createFileRoute('/card')({ component: Page })
`

/** The app's own router module (the client entry loads it), importing `Card` through the route file or not. */
const router = (importsCard: boolean) =>
  `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
${importsCard ? "import { Card } from './routes/card'\n;(globalThis as any).Card = Card\n" : ''}export const getRouter = () => createRouter({ routeTree })
`

const files = {
  'src/routes/card.tsx': route,
  'src/router.tsx': router(false),
  'entry.ts': 'export const ok = true\n',
}

describe.each(startBundlers)('a %s client build', (bundler) => {
  test(
    'an exported component only the split component renders loads with its chunk, unreported',
    async () => {
      const build = await buildStart({ bundler, files })
      expect(build.client.where('MARK_CARD')).toBe('lazy')
      expect(
        findDiagnostics(build.diagnostics, {
          file: 'src/routes/card.tsx',
          root: build.root,
        }),
      ).toEqual([])
    },
    timeout,
  )

  test(
    'an exported component the router module imports through the route file loads with the entry, and the build says so once',
    async () => {
      const build = await buildStart({
        bundler,
        files: { ...files, 'src/router.tsx': router(true) },
      })
      expect(build.client.where('MARK_CARD')).toBe('eager+lazy')
      expectDiagnostic(build.client.warnings, {
        severity: 'warning',
        file: 'src/routes/card.tsx',
        root: build.root,
        times: 1,
      })
    },
    timeout,
  )
})
