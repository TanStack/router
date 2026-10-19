// Slow-tier half of this suite: what a route file's pragmas mean in a real
// project, decided by the project's own tools (its JSX transform, its
// framework's refresh runtime in a page). The in-process rows are in
// ../code-splitter-pragmas.test.ts (fast tier).
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, frameworks, routeApp, routeHead } from '../build-harness'
import { openRouteHmrPage } from '../route-hmr-page'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from '../build-harness'

const timeout = 120_000

// D-04 (SPEC J2.16): a chunk's JSX compiles under the runtime decision of
// its source file. What a pragma written after the imports means is the
// project's JSX transform's decision (Vite's Oxc reads leading pragmas only;
// Rspack's SWC reads a pragma above any top-level statement), and the split
// route must render as the untouched route does: the outcome is the computed
// colour of the styled element in a real browser, Emotion's `css` prop
// applied or left as a plain attribute. Leaving the component unsplit with a
// warning naming the file and the option is also fine (J2.8).
describe('a @jsxImportSource pragma written after the imports', () => {
  const styledRoute = `${routeHead()}/** @jsxImportSource @emotion/react */
function Page() {
  return <div id="styled" css={{ color: 'red' }}>MARK_STYLED</div>
}
export const Route = createFileRoute('/')({ component: Page })
`

  /**
   * Builds the route for the browser (split or untouched), mounts its
   * component and reads the colour the element gets.
   */
  async function styledColour(bundler: Bundler, autoCodeSplitting: boolean) {
    const app = await build({
      bundler,
      env: 'client',
      pluginOptions: { autoCodeSplitting },
      files: routeApp(styledRoute, { env: 'client' }),
    })
    const run = await app.run(`await entry.mount(entry.Route.options.component)
return getComputedStyle(document.getElementById('styled')).color`)
    expect(run.html).toContain('MARK_STYLED')
    return { app, colour: run.result as string }
  }

  async function expectSplitRendersLikeUntouched(
    bundler: Bundler,
    untouchedStyled: boolean,
  ) {
    const untouched = await styledColour(bundler, false)
    expect(
      untouched.colour === 'rgb(255, 0, 0)',
      `precondition: the project's JSX transform ${untouchedStyled ? 'reads' : 'ignores'} the pragma in the untouched file (colour ${untouched.colour})`,
    ).toBe(untouchedStyled)
    const split = await styledColour(bundler, true)
    if (split.app.where('MARK_STYLED') !== 'lazy') {
      expectDiagnostic([...split.app.warnings, ...split.app.consoleMessages], {
        file: 'routes/index.tsx',
        root: split.app.root,
        names: ['component'],
      })
    }
    expect(split.colour).toBe(untouched.colour)
  }

  test(
    'means in the split route what it means in the untouched route (Rspack: SWC reads it)',
    () => expectSplitRendersLikeUntouched('rspack', true),
    timeout,
  )

  // Bug: the chunk of the split component starts with the pragma comment
  // (the imports above it in the route file are gone from the chunk), so
  // Oxc reads it there: the split component is styled by Emotion where the
  // untouched route left the `css` prop as an attribute. Same bug as the
  // fast-tier pin in ../code-splitter-pragmas.test.ts.
  // Source: V1 split F12 (D-04 ruled 2026-10-18).
  // Impact: with Vite 8, a route renders differently once its component is
  // split.
  test.fails(
    'means in the split route what it means in the untouched route (Vite: Oxc ignores it)',
    () => expectSplitRendersLikeUntouched('vite', false),
    timeout,
  )
})

// A framework JSX plugin registered before the router plugin is an order the
// docs do not support (SPEC G11): the build either works (the component is
// split and renders) or fails with an error naming both plugins, so the
// user can act. Never a silent wrong result.
// Source: V1 split F18; V2-26 (#6760: `vueJsx()` before the router plugin).
describe('a framework JSX plugin registered before the router plugin', () => {
  const route = (
    framework: Framework,
  ) => `${routeHead(framework)}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
  const jsxPlugins: Record<
    Framework,
    { name: string; create: () => Promise<unknown> }
  > = {
    react: {
      name: '@vitejs/plugin-react',
      create: async () => (await import('@vitejs/plugin-react')).default(),
    },
    solid: {
      name: 'vite-plugin-solid',
      create: async () =>
        (await import('vite-plugin-solid')).default({ ssr: true }),
    },
    vue: {
      name: '@vitejs/plugin-vue-jsx',
      create: async () => (await import('@vitejs/plugin-vue-jsx')).default(),
    },
  }

  test.each(frameworks)(
    'splits the route of a %s app and renders it, or fails the build naming both plugins',
    async (framework) => {
      const { name, create } = jsxPlugins[framework]
      const jsxPlugin = await create()
      const { tanstackRouter } = await import('../../src/vite')
      let app
      try {
        app = await build({
          bundler: 'vite',
          env: 'ssr',
          // The JSX plugin is given here, first; the harness's own Solid
          // plugin would come after the router plugin.
          ...(framework !== 'solid' && { framework }),
          pluginOptions: { target: framework },
          routerPlugins: (config) => [jsxPlugin, tanstackRouter(config)],
          files: routeApp(route(framework), { env: 'ssr', framework }),
        })
      } catch (error) {
        if (!(error instanceof BuildError)) {
          throw error
        }
        expectDiagnostic(error, { names: [name, '@tanstack/router-plugin'] })
        return
      }
      expect(app.where('MARK_COMPONENT')).toBe('lazy')
      const run = await app.run(
        'return await entry.render(entry.Route.options.component)',
      )
      expect(run.result).toContain('MARK_COMPONENT')
    },
    timeout,
  )
})

// solid-refresh reads its `// @refresh reload` comments per module, so every
// module holding route code keeps them; the outcome is solid-refresh's own
// (it reloads what the comment governs, and whether that is a hot update or
// a page reload is its call: SPEC G10 never requires a reload). Source: V1
// split F14. (React's `/* @refresh reset */` has no observable effect under
// Vite 8's `@vitejs/plugin-react`, split or not: no outcome to assert.)
describe('refresh pragma comments of a route file, in a real page', () => {
  const solidCounter = (
    header: string,
    aboveComponent: string,
    version: string,
  ) => `${header}import { createFileRoute } from '@tanstack/solid-router'
import { createSignal } from 'solid-js'
${aboveComponent}function Page() {
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(count() + 1)}>
      Counter ${version} count {count()}
    </button>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`

  test.each([
    {
      name: 'a // @refresh reload file header',
      header: '// @refresh reload\n',
      aboveComponent: '',
    },
    {
      name: 'a // @refresh reload comment above the split component',
      header: '',
      aboveComponent: '// @refresh reload\n',
    },
  ])(
    'with $name, an edit of a Solid route shows the new content',
    async ({ header, aboveComponent }) => {
      const app = await openRouteHmrPage({
        target: 'solid',
        files: {
          'routes/index.tsx': solidCounter(header, aboveComponent, 'v1'),
        },
        ready: 'Counter v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('Counter v1 count 1')
      await app.edit(
        { 'routes/index.tsx': solidCounter(header, aboveComponent, 'v2') },
        /Counter v2 count \d/,
      )
    },
    timeout,
  )
})
