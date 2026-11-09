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
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, rootRouteOf } from '../build-harness'
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

const reactFiles = {
  ...shared('react'),
  'hoc.tsx':
    'export function withTracking<T>(component: T) { return component }\n',
  'chart.tsx': 'export default function Chart() { return <p>chart</p> }\n',
  'routes/memo.tsx': route(
    'react',
    'memo',
    "import { memo } from 'react'",
    "const Page = memo(function Inner() { return <p>{'MARK_memo'}</p> })",
  ),
  'routes/forward-ref.tsx': route(
    'react',
    'forward-ref',
    "import { forwardRef } from 'react'",
    `const Field = forwardRef<HTMLParagraphElement>(function Field(_props, ref) {
  return <p ref={ref}>{'MARK_forward-ref'}</p>
})
const Page = () => <Field />`,
  ),
  'routes/lazy-component.tsx': route(
    'react',
    'lazy-component',
    "import { lazy } from 'react'",
    "const Page = lazy(() => import('../chart').then((m) => ({ default: m.default, tag: 'MARK_lazy-component' })))",
  ),
  'routes/renamed.tsx': route(
    'react',
    'renamed',
    "import { memo as remember } from 'react'",
    "const Page = remember(function Inner() { return <p>{'MARK_renamed'}</p> })",
  ),
  'routes/namespace.tsx': route(
    'react',
    'namespace',
    "import * as React from 'react'",
    `const Page = React.memo(
  React.forwardRef<HTMLParagraphElement>(function Inner(_props, ref) {
    return <p ref={ref}>{'MARK_namespace'}</p>
  }),
)`,
  ),
  // React's default import is its exports object, as a namespace import
  'routes/default-import.tsx': route(
    'react',
    'default-import',
    "import React from 'react'",
    `const Page = React.memo(
  React.forwardRef<HTMLParagraphElement>(function Inner(_props, ref) {
    return <p ref={ref}>{'MARK_default-import'}</p>
  }),
)`,
  ),
  'routes/default-lazy.tsx': route(
    'react',
    'default-lazy',
    "import { default as React } from 'react'",
    "const Page = React.lazy(() => import('../chart').then((m) => ({ default: m.default, tag: 'MARK_default-lazy' })))",
  ),
  // an impure argument: the call stays an effect
  'routes/impure.tsx': route(
    'react',
    'impure',
    "import { memo } from 'react'\nimport { withTracking } from '../hoc'",
    "const Page = memo(withTracking(function Inner() { return <p>{'MARK_impure'}</p> }))",
  ),
  // a local function of the same name is not React's
  'routes/local.tsx': route(
    'react',
    'local',
    '',
    `function memo<T>(component: T) { return component }
const Page = memo(function Inner() { return <p>{'MARK_local'}</p> })`,
  ),
  // the component's own augmentation and a memo of it (real apps: the
  // augmentation writes `Inner` and `memo` reads it at load, so an unknown
  // `memo` call kept both); no call stays after it
  'routes/display-name.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { memo } from 'react'
function Inner() {
  return <p>{'MARK_display-name'}</p>
}
Inner.displayName = 'Named'
const Page = memo(Inner)
export const Route = createFileRoute('/display-name')({
  component: Page,
})
`,
  'routes/display-name-memo.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { memo } from 'react'
const Page = memo(function Inner() {
  return <p>{'MARK_display-name-memo'}</p>
})
Page.displayName = 'Named'
export const Route = createFileRoute('/display-name-memo')({
  component: Page,
})
`,
  // a context is one instance: it stays (its call is an effect the later
  // call keeps in order) and the memo component reading it splits
  'routes/context.tsx': route(
    'react',
    'context',
    "import { createContext, memo, useContext } from 'react'",
    `const Theme = createContext('MARK_theme')
const Page = memo(function Inner() {
  return <p>{useContext(Theme)}{'MARK_context'}</p>
})`,
  ),
}

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
    'vite react',
    reactFiles,
    [
      'memo',
      'forward-ref',
      'lazy-component',
      'renamed',
      'namespace',
      'default-import',
      'default-lazy',
      'display-name',
      'display-name-memo',
    ],
    () => build({ bundler: 'vite', env: 'client', files: reactFiles }),
  ],
  [
    'rsbuild react',
    reactFiles,
    [
      'memo',
      'forward-ref',
      'lazy-component',
      'renamed',
      'namespace',
      'default-import',
      'default-lazy',
      'display-name',
      'display-name-memo',
    ],
    () => buildWithRsbuild({ files: reactFiles, registerCleanup: () => {} }),
  ],
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
      if (!name.endsWith('react')) {
        return
      }
      // the call is an effect: kept before the call that stays, so the
      // option it creates is not split, reported at the option
      for (const path of ['impure', 'local']) {
        expect(app.where(`MARK_${path}`), path).toBe('eager')
        expectDiagnostic(reported, {
          severity: 'warning',
          file: `routes/${path}.tsx`,
          root: app.root,
          ...(!name.startsWith('vite') && {
            position: diagnosticPosition(files[`routes/${path}.tsx`]!, 'Page,'),
          }),
          times: 1,
        })
      }
      // the component loads with the chunk, the context with the route
      // module, reported at the context only
      expect(app.where('MARK_context')).toBe('lazy')
      expect(app.where('MARK_theme')).toBe('eager')
      expectDiagnostic(reported, {
        severity: 'warning',
        file: 'routes/context.tsx',
        root: app.root,
        ...(!name.startsWith('vite') && {
          position: diagnosticPosition(files['routes/context.tsx']!, 'Theme ='),
        }),
        times: 1,
      })
    },
    timeout,
  )
})
