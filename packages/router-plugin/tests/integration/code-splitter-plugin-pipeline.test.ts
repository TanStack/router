// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../code-splitter-plugin-pipeline.test.ts (fast tier).
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { expect, it } from 'vitest'
import { build, routeApp } from '../build-harness'

// A route file that both imports and declares `Route` is invalid TypeScript
// (TS2440). A real build either fails with an error naming `Route`, or
// builds a page that renders; it never builds a page that breaks. Source:
// the #8504 confidence campaign (DX-07).
it.each(['vite', 'rspack'] as const)(
  'a route file that imports and declares Route fails its build naming Route, or renders (%s)',
  async (bundler) => {
    let outcome: string
    try {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(
          `import { createFileRoute } from '@tanstack/react-router'
import { Route } from '../other'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })
`,
          { env: 'client', files: { 'other.ts': 'export const Route = 1\n' } },
        ),
      })
      outcome = String(
        (await app.run(`await entry.mount(entry.Route.options.component)`))
          .html,
      )
    } catch (error) {
      if (error instanceof BuildError && /\bRoute\b/.test(error.message)) {
        outcome = 'refused naming Route'
      } else {
        throw error
      }
    }
    expect([
      'refused naming Route',
      '<div id="root"><p>page</p></div>',
    ]).toContain(outcome)
  },
  60_000,
)
