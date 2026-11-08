/**
 * Where an app lists Start's plugin relative to the framework's own plugin.
 * Found by the plugin-ecosystem release check (F1): with
 * `plugins: [solidPlugin({ ssr: true }), tanstackStart()]`, Solid's dev
 * transform (its hot-update wrapper around every component) ran before
 * Start's compiler, so the dev client kept each route component in the route
 * module while the server split it; the page never hydrated, a route edit
 * reloaded it and a server fn call failed. That order is refused, as on main,
 * and the order the refusal asks for works (the Solid rows). React's and
 * Vue's plugins transform after Start's whatever the order: Start listed
 * last works there (main refused it after `react()`), and on Rsbuild, whose
 * Start loader runs before Solid's Babel loader in any plugin order.
 *
 * Each app: an index route whose component imports a module of its own
 * (`src/home-dep.ts`, a load marker) and calls a server fn on a click, and
 * an `/other` route. On `/other` the index route's component must not have
 * loaded (the route is split in the client); on `/` the page hydrates (the
 * click answers with the server fn's result) without errors, and a route
 * edit applies in place.
 */ import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import {
  loadMarker,
  loadedModulesExpression,
} from '@tanstack/compiler-test-utils/importers'
import { startDevServer } from '../dev-server'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../rsbuild-dev-server'
import { createStartHost } from '../start-host'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { StartFramework } from '../start-plugins'

const timeout = 90_000

const homeDep = 'home-dep'

const routeFileNames = [
  'src/routes/__root.tsx',
  'src/routes/index.tsx',
  'src/routes/other.tsx',
]

/** Files every app has: the server fn, the index route's own module and `/other`. */
const routeFiles = (framework: StartFramework) => ({
  'src/fns.ts': `import { createServerFn } from '@tanstack/${framework}-start'
export const greet = createServerFn().handler(() => 'fn-ok')
`,
  'src/home-dep.ts': `${loadMarker(homeDep)}export const depText = 'dep'\n`,
  'src/routes/other.tsx':
    framework === 'vue'
      ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Other = defineComponent({ setup: () => () => <p data-probe="other">other</p> })
export const Route = createFileRoute('/other')({ component: Other })
`
      : `import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/other')({ component: Other })
function Other() {
  return <p data-probe="other">other</p>
}
`,
})

/** The index route: `text`, the dependency's text, and a button showing the server fn's answer. */
const indexRoute = (framework: StartFramework, text: string) => {
  if (framework === 'vue') {
    return `import { defineComponent, ref } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { greet } from '../fns'
import { depText } from '../home-dep'
const Home = defineComponent({
  setup: () => {
    const answer = ref('none')
    return () => (
      <div>
        <p data-probe="home">${text}:{depText}</p>
        <button data-fn onClick={async () => { answer.value = await greet() }}>{answer.value}</button>
      </div>
    )
  },
})
export const Route = createFileRoute('/')({ component: Home })
`
  }
  const state =
    framework === 'react'
      ? `const [answer, setAnswer] = useState('none')`
      : `const [answer, setAnswer] = createSignal('none')`
  return `import { ${framework === 'react' ? 'useState' : 'createSignal'} } from '${framework === 'react' ? 'react' : 'solid-js'}'
import { createFileRoute } from '@tanstack/${framework}-router'
import { greet } from '../fns'
import { depText } from '../home-dep'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  ${state}
  return (
    <div>
      <p data-probe="home">${text}:{depText}</p>
      <button data-fn onClick={async () => setAnswer(await greet())}>{${framework === 'react' ? 'answer' : 'answer()'}}</button>
    </div>
  )
}
`
}

/** The dev apps' entries, router and document shell. */
const devAppFiles: Record<StartFramework, Record<string, string>> = {
  react: {
    'harness/client-entry.ts': `import '../src/hmr-sync'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
    'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
    'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
    'src/routes/__root.tsx': `import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({ shellComponent: Shell })
function Shell({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
`,
  },
  solid: {
    'harness/client-entry.ts': `import '../src/hmr-sync'
import { createComponent, hydrate } from 'solid-js/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'
hydrateStart().then((router) => {
  hydrate(() => createComponent(StartClient, { router }), document)
})
`,
    'harness/server-entry.ts': `export { default } from '@tanstack/solid-start/server-entry'\n`,
    'src/router.ts': `import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
    'src/routes/__root.tsx': `import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { JSX } from 'solid-js'
export const Route = createRootRoute({ shellComponent: Shell })
function Shell(props: { children: JSX.Element }) {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
`,
  },
  vue: {
    'harness/client-entry.ts': `import '../src/hmr-sync'
import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'
hydrateStart().then((router) => {
  createSSRApp(StartClient, { router }).mount('#__app')
})
`,
    'harness/server-entry.ts': `export { default } from '@tanstack/vue-start/server-entry'\n`,
    'src/router.ts': `import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
    'src/routes/__root.tsx': `import { defineComponent } from 'vue'
import { Body, HeadContent, Html, Scripts, createRootRoute } from '@tanstack/vue-router'
const Shell = defineComponent({
  setup(_, { slots }) {
    return () => (
      <Html>
        <head>
          <HeadContent />
        </head>
        <Body>
          {slots.default?.()}
          <Scripts />
        </Body>
      </Html>
    )
  },
})
export const Route = createRootRoute({ shellComponent: Shell })
`,
  },
}

/** The framework's own Vite plugins, as an app lists them. */
const frameworkPlugins = (framework: StartFramework) =>
  framework === 'react'
    ? [react()]
    : framework === 'solid'
      ? [solid({ ssr: true })]
      : [vue(), vueJsx()]

/** The modules `loadMarker` recorded in the page. */
const loaded = (page: BrowserPage) =>
  page.page.evaluate<Array<string>>(loadedModulesExpression)

/** `/other` of the app: the index route's component has not loaded. */
async function expectSplitOnOther(url: string) {
  const page = await openPage(new URL('/other', url).href, {
    registerCleanup: onTestFinished,
  })
  await page.waitForText('other', { selector: '[data-probe=other]' })
  await page.page.waitForFunction(
    () => (window as any).__TSR_ROUTER__ !== undefined,
  )
  expect(await loaded(page)).not.toContain(homeDep)
  expect(page.errors).toEqual([])
}

/** `/` of the app: the page hydrated, so the click calls the server fn and shows its answer. */
async function expectHydratedHome(url: string, text: string) {
  const page = await openPage(url, { registerCleanup: onTestFinished })
  await page.waitForText(`${text}:dep`, { selector: '[data-probe=home]' })
  await expect
    .poll(
      async () => {
        await page.page.locator('button[data-fn]').click()
        return page.page.locator('button[data-fn]').textContent()
      },
      { timeout: 15_000 },
    )
    .toBe('fn-ok')
  expect(page.errors).toEqual([])
  return page
}

/** A dev server of `framework`'s app, Start listed first or last. */
const devServer = (framework: StartFramework, startLast: boolean) =>
  startDevServer({
    framework,
    start: {},
    browser: true,
    plugins: frameworkPlugins(framework),
    startLast,
    files: {
      ...devAppFiles[framework],
      ...routeFiles(framework),
      'src/hmr-sync.ts': hmrSyncModule,
      'src/routes/index.tsx': indexRoute(framework, 'home-v1'),
    },
  })

/** A host building `framework`'s app, Start listed first or last. */
const buildHost = async (framework: StartFramework, startLast: boolean) => {
  const host = await createStartHost({
    framework,
    serve: false,
    startLast,
    files: {
      ...routeFiles(framework),
      'src/routes/index.tsx': indexRoute(framework, 'home-v1'),
    },
  })
  onTestFinished(() => host.close())
  return host
}

describe('Vite dev', () => {
  test(
    'solid: Start listed after vite-plugin-solid is refused',
    async () => {
      await expect(devServer('solid', true)).rejects.toThrow()
    },
    timeout,
  )

  test.each([
    ['solid', false],
    ['react', true],
    ['vue', true],
  ] as const)(
    '%s (Start last: %s): the route splits in the client, the page hydrates and a route edit applies in place',
    async (framework, startLast) => {
      const server = await devServer(framework, startLast)
      await expectSplitOnOther(server.url!)
      const page = await expectHydratedHome(server.url!, 'home-v1')
      const inFlight = trackRequests(page)
      await server.idle()
      const loads = page.loads()
      await server.edit({
        'src/routes/index.tsx': indexRoute(framework, 'home-v2'),
      })
      await settlePage(server, page, inFlight)
      expect(await page.page.locator('[data-probe=home]').textContent()).toBe(
        'home-v2:dep',
      )
      expect(page.loads(), 'the route edit reloaded the page').toBe(loads)
      expect(page.errors).toEqual([])
      // nothing reported about the app's routes (the route is split)
      expect(
        routeFileNames.flatMap((file) =>
          findDiagnostics(server.diagnostics, { file, root: server.root }),
        ),
      ).toEqual([])
    },
    timeout,
  )
})

describe('Vite build', () => {
  test(
    'solid: Start listed after vite-plugin-solid is refused',
    async () => {
      await expect(
        buildHost('solid', true).then((host) => host.build()),
      ).rejects.toThrow()
    },
    timeout,
  )

  test.each([
    ['solid', false],
    ['react', true],
  ] as const)(
    '%s (Start last: %s): the route splits in the client and the page hydrates',
    async (framework, startLast) => {
      const host = await buildHost(framework, startLast)
      const { url } = await host.preview()
      await expectSplitOnOther(url)
      await expectHydratedHome(url, 'home-v1')
    },
    timeout,
  )
})

describe('Rsbuild dev, Start listed after the framework plugin', () => {
  test(
    'solid: the route splits in the client, the page hydrates and a route edit applies in place',
    async () => {
      const server = await startRsbuildStartDevServer({
        framework: 'solid',
        hmr: true,
        browser: true,
        startLast: true,
        config: {
          plugins: [
            pluginBabel({ include: /\.(?:jsx|tsx)$/ }),
            pluginSolid({ ssr: true }),
          ],
          // Start serves the pages, not an HTML template.
          tools: { htmlPlugin: false },
        },
        files: {
          ...devAppFiles.solid,
          ...routeFiles('solid'),
          'src/hmr-sync.ts': 'export {}\n',
          'src/routes/index.tsx': indexRoute('solid', 'home-v1'),
        },
      })
      expect(reportedErrors(server)).toEqual([])
      await expectSplitOnOther(server.url!)
      const page = await expectHydratedHome(server.url!, 'home-v1')
      await server.edit({
        'src/routes/index.tsx': indexRoute('solid', 'home-v2'),
      })
      await page.waitForText('home-v2:dep', {
        selector: '[data-probe=home]',
        timeout: 20_000,
      })
      expect(page.loads(), 'the route edit reloaded the page').toBe(1)
      expect(page.errors).toEqual([])
      expect(reportedErrors(server)).toEqual([])
      // nothing reported about the app's routes (the route is split)
      expect(
        routeFileNames.flatMap((file) =>
          findDiagnostics(server.diagnostics, { file, root: server.root }),
        ),
      ).toEqual([])
    },
    timeout,
  )
})
