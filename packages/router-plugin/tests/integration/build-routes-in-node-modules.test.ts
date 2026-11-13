/**
 * The router plugin's webpack/Rspack loader does not run on files under
 * `node_modules`, so a route file there (a routes package resolved without
 * following symlinks, a `physical()` mount of an installed package) is not
 * code-split: the build warns once per such file, naming it (the package's
 * rule for a split the user's layout prevents).
 */
import { describe, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, rootRoute, routeHead, ssrRenderEntry } from '../build-harness'

const timeout = 60_000

const routes = 'node_modules/@acme/routes'

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'a route file under node_modules is reported as not split, once',
    async () => {
      const result = await build({
        bundler,
        pluginOptions: { routesDirectory: routes },
        files: {
          [`${routes}/__root.tsx`]: rootRoute,
          [`${routes}/index.tsx`]: `${routeHead()}export const Route = createFileRoute('/')({ component: () => <p>index</p> })\n`,
          'entry.ts': ssrRenderEntry.replace(
            './routes/index',
            `./${routes}/index`,
          ),
        },
      })
      expectDiagnostic(result.warnings, {
        severity: 'warning',
        file: `${routes}/index.tsx`,
        root: result.root,
        times: 1,
      })
    },
    timeout,
  )
})
