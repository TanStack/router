// Slow-tier half of this suite: what a route file's pragmas mean in a real
// project, decided by the project's own tools (its JSX transform, its
// framework's refresh runtime in a page). The in-process rows are in
// ../code-splitter-pragmas.test.ts (fast tier).
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
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
        severity: 'warning',
        file: 'routes/index.tsx',
        root: split.app.root,
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
// docs do not support (SPEC G11): the build either works (the page renders,
// with the component split or left in the route with a warning the user can
// act on: naming the route file, or both plugins) or fails with an error
// naming both plugins (their package, factory or plugin name; the wording
// is free), so the user can act. Never a silent wrong result.
// Source: V1 split F18; V2-26 (#6760: `vueJsx()` before the router plugin).
describe('a framework JSX plugin registered before the router plugin', () => {
  const route = (
    framework: Framework,
  ) => `${routeHead(framework)}function Page() {
  return <p>MARK_COMPONENT</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
  /**
   * Each framework's JSX plugin, and the names a user knows it by: its
   * package, its factory, its Vite plugin names.
   */
  const jsxPlugins: Record<
    Framework,
    { names: RegExp; create: () => Promise<unknown> }
  > = {
    react: {
      names: /@vitejs\/plugin-react|\bvite:react-[\w:-]+/,
      create: async () => (await import('@vitejs/plugin-react')).default(),
    },
    solid: {
      names: /vite-plugin-solid|\bsolid\(\)|['"`]solid['"`]/,
      create: async () =>
        (await import('vite-plugin-solid')).default({ ssr: true }),
    },
    vue: {
      names: /@vitejs\/plugin-vue-jsx|\bvueJsx\b|\bvite:vue-jsx\b/,
      create: async () => (await import('@vitejs/plugin-vue-jsx')).default(),
    },
  }
  /** The names a user knows the router plugin by. */
  const routerPluginNames =
    /@tanstack\/router-plugin|\btanstackRouter\b|\bTanStackRouterVite\b|\btanstack-router\b/

  /** Whether a diagnostic's text names both plugins. */
  const namesBoth = (text: string, jsx: RegExp) =>
    jsx.test(text) && routerPluginNames.test(text)

  test.each(frameworks)(
    'splits the route of a %s app and renders it, or fails the build naming both plugins',
    async (framework) => {
      const { names, create } = jsxPlugins[framework]
      const jsxPlugin = await create()
      const { tanstackRouter } = await import('../../src/vite')
      let app
      try {
        app = await build({
          bundler: 'vite',
          env: 'ssr',
          // The JSX plugin is given here, first; the harness adds no
          // other plugin of the same name.
          framework,
          pluginOptions: { target: framework },
          routerPlugins: (config) => [jsxPlugin, tanstackRouter(config)],
          files: routeApp(route(framework), { env: 'ssr', framework }),
        })
      } catch (error) {
        if (!(error instanceof BuildError)) {
          throw error
        }
        expect(
          diagnosticsOf(error, 'error').some(({ text }) =>
            namesBoth(text, names),
          ),
          String(error),
        ).toBe(true)
        return
      }
      const run = await app.run(
        'return await entry.render(entry.Route.options.component)',
      )
      expect(run.result).toContain('MARK_COMPONENT')
      if (app.where('MARK_COMPONENT') !== 'lazy') {
        const reported = [...app.warnings, ...app.consoleMessages]
        expect(
          reported.some(
            ({ text, severity }) =>
              severity === 'warning' && namesBoth(text, names),
          ) ||
            findDiagnostics(reported, {
              severity: 'warning',
              file: 'routes/index.tsx',
              root: app.root,
            }).length > 0,
          `the component stays in the route, reported: ${JSON.stringify(reported.map(({ text }) => text))}`,
        ).toBe(true)
      }
    },
    timeout,
  )
})

// solid-refresh reads its `// @refresh reload` comments per module, so every
// module holding route code keeps them; the outcome is solid-refresh's own
// (it reloads what the comment governs, and whether that is a hot update or
// a page reload is its call: SPEC G10 never requires a reload). The oracle
// is the same app with the route left unsplit (`autoCodeSplitting: false`):
// after the same click and the same edit, the split app shows what the
// unsplit app shows (the new content, and the counter state the pragma
// leaves: the count the click set is reset). With Vite 8 and
// vite-plugin-solid the pragma's only other effect on the unsplit app is a
// page reload instead of a hot update, which G10 does not let a test
// require. Source: V1 split F14, V1R split S07. (React's `/* @refresh reset */` has no
// observable effect under Vite 8's `@vitejs/plugin-react`, split or not: no
// outcome to assert.)
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

  /**
   * Opens the app, clicks the counter once, edits the route and returns
   * what the counter shows once the page shows the new content.
   */
  async function counterAfterEdit(
    autoCodeSplitting: boolean,
    header: string,
    aboveComponent: string,
  ) {
    const app = await openRouteHmrPage({
      target: 'solid',
      pluginOptions: { autoCodeSplitting },
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
    return /Counter v2 count \d/.exec(await app.page.text())?.[0]
  }

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
    'with $name, an edit of a Solid route shows what it shows unsplit',
    async ({ header, aboveComponent }) => {
      const [unsplit, split] = await Promise.all([
        counterAfterEdit(false, header, aboveComponent),
        counterAfterEdit(true, header, aboveComponent),
      ])
      expect(unsplit).toMatch(/Counter v2 count \d/)
      expect(split).toBe(unsplit)
    },
    timeout,
  )
})
