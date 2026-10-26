/**
 * A Vite library build of a route package (`build.lib`, the `router` package
 * of the `router-monorepo` examples): the build leaves its dependencies
 * external, so its chunks import packages that are not chunks of the bundle.
 * The plugin's end-of-build report (which split exports an entry chunk still
 * holds) walks the entry's imports and must skip those.
 */
import { expect, test } from 'vitest'
import { build, head, rootRoute } from '../build-harness'
import { timeout } from '../production-bundle'

const external = ['react', 'react/jsx-runtime', '@tanstack/react-router']

test(
  'a library build whose chunks import external packages builds',
  async () => {
    const { tanstackRouter } = await import('../../src/vite')
    const app = await build({
      bundler: 'vite',
      env: 'client',
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        'entry.ts': `export { Route } from './routes/index'\n`,
      },
      routerPlugins: (config) => [
        tanstackRouter(config),
        {
          name: 'test:library-externals',
          config: () => ({ build: { rollupOptions: { external } } }),
        },
      ],
    })
    // the externals stayed imports of the entry chunk (not bundled) …
    expect(app.entry.code).toMatch(/\bfrom\s*["']@tanstack\/react-router["']/)
    // … and the component still splits into a chunk of its own
    expect(app.lazy.length).toBeGreaterThan(0)
  },
  timeout,
)
