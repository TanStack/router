/**
 * The framework calls that are pure at module level when their arguments
 * are (React `memo`, `forwardRef`, `lazy`; Vue `defineComponent`,
 * `defineAsyncComponent`; Solid `lazy`) are no effect: a module-level
 * component only the split `component` reads loads with its chunk although
 * an inline `validateSearch` call after it stays in the route module (that
 * call would otherwise keep it there to preserve the file's order of
 * effects, with a warning). Learned from real apps: Vue example routes
 * declaring `defineComponent({…})` above `validateSearch`, and `lazy()`
 * consts of a React app (converit, 11 of 12 kept). Recognised by binding to
 * the framework package's export: a renamed import, a namespace member and
 * a member of React's default import (the package's CommonJS exports) are
 * recognised; an impure argument keeps the call an effect; a local
 * function of the same name is not the framework's.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, rootRouteOf } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from '../build-harness'

const timeout = 120_000

/**
 * A route whose `component` reads `declaration` (it declares `Page`, which
 * holds `MARK_<path>` so the build output locates it), followed by a
 * `validateSearch` call that stays in the route module and runs after it.
 */
const route = (
  framework: Framework,
  path: string,
  imports: string,
  declaration: string,
) => `import { createFileRoute } from '@tanstack/${framework}-router'
import { makeSchema } from '../schema'
${imports}
${declaration}
export const Route = createFileRoute('/${path}')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: Page,
})
`

const shared = (framework: Framework) => ({
  'routes/__root.tsx': rootRouteOf(framework),
  'schema.ts': 'export function makeSchema<T>(shape: T) { return shape }\n',
  'entry.ts': `import { routeTree } from './routeTree.gen'
export { routeTree }
`,
})

const vueFiles = {
  ...shared('vue'),
  'chart.tsx': `import { defineComponent } from 'vue'
export default defineComponent({ setup: () => () => <p>chart</p> })
`,
  'routes/options.tsx': route(
    'vue',
    'options',
    "import { defineComponent } from 'vue'",
    `const Page = defineComponent({
  name: 'Page',
  setup() {
    return () => <p>{'MARK_options'}</p>
  },
})`,
  ),
  'routes/setup-function.tsx': route(
    'vue',
    'setup-function',
    "import { defineComponent } from 'vue'",
    "const Page = defineComponent(() => () => <p>{'MARK_setup-function'}</p>)",
  ),
  'routes/async.tsx': route(
    'vue',
    'async',
    "import { defineAsyncComponent } from 'vue'",
    "const Page = defineAsyncComponent({ loader: () => import('../chart'), delay: 0, name: 'MARK_async' })",
  ),
  'routes/namespace.tsx': route(
    'vue',
    'namespace',
    "import * as Vue from 'vue'",
    "const Page = Vue.defineComponent({ setup: () => () => <p>{'MARK_namespace'}</p> })",
  ),
}

const solidFiles = {
  ...shared('solid'),
  'chart.tsx': 'export default function Chart() { return <p>chart</p> }\n',
  'routes/lazy-component.tsx': route(
    'solid',
    'lazy-component',
    "import { lazy } from 'solid-js'",
    "const Page = lazy(() => import('../chart').then((m) => ({ default: m.default, tag: 'MARK_lazy-component' })))",
  ),
}

const builds: Array<
  [string, Record<string, string>, Array<string>, () => Promise<BuildResult>]
> = [
  [
    'vite vue',
    vueFiles,
    ['options', 'setup-function', 'async', 'namespace'],
    () =>
      build({
        bundler: 'vite',
        env: 'client',
        framework: 'vue',
        files: vueFiles,
      }),
  ],
  [
    'vite solid',
    solidFiles,
    ['lazy-component'],
    () =>
      build({
        bundler: 'vite',
        env: 'client',
        framework: 'solid',
        files: solidFiles,
      }),
  ],
]

describe.each(builds)('a %s client build', (name, files, pure, create) => {
  test(
    'loads a component a pure framework call creates with the chunk that reads it',
    async () => {
      const app = await create()
      const reported = [...app.warnings, ...app.consoleMessages]
      const warnings = (path: string) =>
        findDiagnostics(reported, {
          file: `routes/${path}.tsx`,
          root: app.root,
        })
      expect(
        Object.fromEntries(
          pure.map((path) => [
            path,
            { where: app.where(`MARK_${path}`), warnings: warnings(path) },
          ]),
        ),
      ).toEqual(
        Object.fromEntries(
          pure.map((path) => [path, { where: 'lazy', warnings: [] }]),
        ),
      )
    },
    timeout,
  )
})
