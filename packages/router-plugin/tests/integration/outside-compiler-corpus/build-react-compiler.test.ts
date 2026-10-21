/**
 * Implementation characterization, outside the compiler corpus (SPEC §8:
 * no clause coverage, must not block a correct rewrite): whether a
 * third-party transform after the router plugin (the React Compiler) is
 * applied to split chunks is out of scope (DECISIONS OQ16). Splitting with
 * the real framework plugins and rendering: build-frameworks.test.ts and
 * code-splitter-plugin-pipeline.test.ts.
 *
 * Plugins after the router plugin see the split modules: with
 * `@vitejs/plugin-react` and the React Compiler (Babel) after it, as the
 * React Compiler docs configure Vite, the split component is compiled by the
 * React Compiler and renders. (The React Compiler preset compiles client
 * environments only.)
 */
import { expect, test } from 'vitest'
import { build, head, routeApp  } from '../../build-harness'

const route = `${head}import { useState } from 'react'
function Page() {
  const [count] = useState(1)
  return <p>{'MARK_COMPONENT ' + count}</p>
}
export const Route = createFileRoute('/')({
  staticData: { label: 'MARK_ROUTE' },
  component: Page,
})
`

/** Code of React Compiler output: its memo cache runtime. */
const compiled = /compiler[_-]runtime|memo_cache_sentinel/

async function buildWithReact(reactCompiler: boolean) {
  const { default: react, reactCompilerPreset } =
    await import('@vitejs/plugin-react')
  const { default: babel } = await import('@rolldown/plugin-babel')
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    extraPlugins: () => [
      react(),
      ...(reactCompiler ? [babel({ presets: [reactCompilerPreset()] })] : []),
    ],
    files: routeApp(route, { env: 'client' }),
  })
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  const component = app.chunks.find((chunk) =>
    chunk.code.includes('MARK_COMPONENT'),
  )!
  return {
    placement: {
      route: app.where('MARK_ROUTE'),
      component: app.where('MARK_COMPONENT'),
    },
    compiled: compiled.test(component.code),
    html: run.html,
  }
}

test.each([false, true])(
  'the split component is compiled by the React Compiler after the router plugin, and renders (React Compiler: %s)',
  async (reactCompiler) => {
    expect(await buildWithReact(reactCompiler)).toEqual({
      placement: { route: 'eager', component: 'lazy' },
      compiled: reactCompiler,
      html: '<div id="root"><p>MARK_COMPONENT 1</p></div>',
    })
  },
  120_000,
)
