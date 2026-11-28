/**
 * The router plugin does not compile files under `node_modules` (Vite's
 * transform filter and the webpack/Rspack loader rule leave them out), so a
 * route file there (a routes package resolved without following symlinks, a
 * `physical()` mount of an installed package) is not code-split: the build
 * warns once per such file, naming it, whatever name its module gives the
 * route constructor it imports, and the file is bundled as written.
 * A route file of the app's routes directory is split as before.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, rootRoute, routeHead, ssrRenderEntry } from '../build-harness'

const routes = 'node_modules/@acme/routes'

const indexRoute = `${routeHead()}export const Route = createFileRoute('/')({
  component: () => <p>MARK_COMPONENT</p>,
})
`

const render = `return await entry.render(entry.Route.options.component)`

describe.each(['vite', 'webpack', 'rspack'] as const)('%s', (bundler) => {
  test('a route file under node_modules is reported as not split, once, and is bundled as written', async () => {
    const result = await build({
      bundler,
      minify: false,
      pluginOptions: { routesDirectory: routes },
      files: {
        [`${routes}/__root.tsx`]: rootRoute,
        [`${routes}/index.tsx`]: indexRoute,
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
    expect(result.where('MARK_COMPONENT')).toBe('eager')
    expect((await result.run(render)).result).toContain('MARK_COMPONENT')
  })

  test('a route file under node_modules naming its constructor otherwise is reported too', async () => {
    const result = await build({
      bundler,
      minify: false,
      pluginOptions: { routesDirectory: routes },
      files: {
        [`${routes}/__root.tsx`]: rootRoute,
        [`${routes}/index.tsx`]: `import { createFileRoute as definePage } from '@tanstack/react-router'
export const Route = definePage('/')({
  component: () => <p>MARK_COMPONENT</p>,
})
`,
        [`${routes}/about.tsx`]: `${routeHead()}export const Route = createFileRoute('/about')({
  component: () => <p>MARK_ABOUT</p>,
})
`,
        'entry.ts': `${ssrRenderEntry.replace(
          './routes/index',
          `./${routes}/index`,
        )}export { Route as About } from './${routes}/about'
`,
      },
    })
    for (const file of ['index.tsx', 'about.tsx']) {
      expectDiagnostic(result.warnings, {
        severity: 'warning',
        file: `${routes}/${file}`,
        root: result.root,
        times: 1,
      })
    }
    expect((await result.run(render)).result).toContain('MARK_COMPONENT')
  })

  test('a route file of the routes directory is split', async () => {
    const result = await build({
      bundler,
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': indexRoute,
        'entry.ts': ssrRenderEntry,
      },
    })
    expect(result.where('MARK_COMPONENT')).toBe('lazy')
    expect((await result.run(render)).result).toContain('MARK_COMPONENT')
  })
})
