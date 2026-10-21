/** Generated trees consumed by the real routers and renderers in Chromium. */
import { test } from 'vitest'
import { checkApp } from '../real-router'
import { frameworkCases, groupLayout, shapeCases } from '../real-router-cases'
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

test.each([...frameworkCases, ...shapeCases, groupLayout, nativeAsyncVue])(
  'the browser renders $name',
  (testCase) => checkApp(testCase, { types: false, client: true }),
)
