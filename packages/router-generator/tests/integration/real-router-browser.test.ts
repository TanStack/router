/** Generated trees consumed by the real routers and renderers in Chromium. */
import { checkApp, checkClientPages } from '../real-router'
import { frameworkCases, groupLayout } from '../real-router-cases'
import { test } from '../test'
import type { Case } from '../real-router'

const nativeAsyncVue: Case = {
  name: 'a Vue route using the framework async-component API',
  config: { target: 'vue' },
  files: {
    'src/routes/__root.ts': `import { h } from 'vue'
import { createRootRoute, Outlet } from '@tanstack/vue-router'
export const Route = createRootRoute({ component: () => h(Outlet) })`,
    'src/routes/index.ts': `import { defineAsyncComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
export const Route = createFileRoute('/')({
  component: defineAsyncComponent(() => import('./-native-page.vue')),
})`,
    'src/routes/-native-page.vue':
      '<template><p>native async page</p></template>',
  },
  expected: { __root__: ['/', null], '/': ['/', '__root__'] },
  visits: { '/': '/' },
  pages: { '/': ['native async page'] },
}

// The pages in Chromium (their routes and server-rendered pages: the unit
// tier's, real-router.test.ts and real-router-frameworks.test.ts; the route
// shapes of shapeCases render none)
test.for([...frameworkCases, groupLayout])(
  'the browser renders $name',
  (testCase, { clientHost, page, pageErrors, appRoot }) =>
    checkClientPages(
      { appRoot, client: { host: clientHost, page, pageErrors } },
      testCase,
    ),
)

// (its routes and server-rendered page are checked here too: no other case
// has them)
test('the browser renders a Vue route using the framework async-component API', ({
  clientHost,
  page,
  pageErrors,
  appRoot,
  routeTreeHost,
}) =>
  checkApp(
    {
      appRoot,
      routeTreeHost,
      client: { host: clientHost, page, pageErrors },
    },
    nativeAsyncVue,
    { types: false },
  ))
