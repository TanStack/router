/**
 * Real builds of a code-split route per bundler and framework: the split
 * component loads lazily and renders, module state the route and the
 * component share is initialised once, and the bundle holds only the
 * target framework.
 */
import { describe, expect, test } from 'vitest'
import { build, frameworks, routeApp, routeHead } from '../build-harness'
import type {
  BuildEnv,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from '../build-harness'

const timeout = 120_000

const bundlers = ['vite', 'rspack', 'webpack'] as const

/** Counts its own evaluations on `globalThis`. */
const sharedModule = `export const shared = {
  inits: ((globalThis as any).__sharedInits = ((globalThis as any).__sharedInits ?? 0) + 1),
}
`

/**
 * A route whose options and split component read an imported module's state
 * and state the route file declares, each counting its evaluations.
 */
const route = (
  framework: Framework,
) => `${routeHead(framework)}import { shared } from '../shared'
const local = {
  inits: ((globalThis as any).__localInits = ((globalThis as any).__localInits ?? 0) + 1),
}
function Page() {
  return <p>{'MARK_COMPONENT ' + shared.inits + ' ' + local.inits}</p>
}
export const Route = createFileRoute('/')({
  staticData: { label: 'MARK_ROUTE', shared, local },
  component: Page,
})
`

/** Code that only a bundle containing the framework's runtime has. */
const frameworkMarkers: Record<Framework, RegExp> = {
  react: /react\.transitional\.element|["']react(?:-dom)?(?:\/[\w-]+)*["']/,
  solid: /solid-proxy|["']solid-js(?:\/[\w-]+)*["']/,
  vue: /__v_isRef|["']vue(?:\/[\w-]+)*["']/,
}

/** What a run returns: evaluations of each state, and what the route read. */
const stateScript = `{
  inits: { shared: globalThis.__sharedInits, local: globalThis.__localInits },
  routeShared: {
    shared: entry.Route.options.staticData.shared.inits,
    local: entry.Route.options.staticData.local.inits,
  },
}`

const builds = new Map<string, ReturnType<typeof buildRoute>>()

/** Builds (once per bundler, framework and environment) and runs the app. */
function cachedBuild(bundler: Bundler, framework: Framework, env: BuildEnv) {
  const key = `${bundler}:${framework}:${env}`
  let result = builds.get(key)
  if (!result) {
    result = buildRoute(bundler, framework, env)
    builds.set(key, result)
  }
  return result
}

async function buildRoute(
  bundler: Bundler,
  framework: Framework,
  env: BuildEnv,
) {
  const app = await build({
    bundler,
    env,
    framework,
    // No outcome here depends on webpack's minifier (terser), which takes
    // most of a webpack build: placement and evaluation counts of live code,
    // the rendering, and which framework runtimes the bundle holds.
    ...(bundler === 'webpack' && { minify: false }),
    // Files outlive the test that built them; the result is all we keep
    registerCleanup: undefined,
    files: routeApp(route(framework), {
      env,
      framework,
      files: { 'shared.ts': sharedModule },
    }),
  })
  try {
    const run = await app.run(
      env === 'ssr'
        ? `const html = await entry.render(entry.Route.options.component)
return { html, ...${stateScript} }`
        : `await entry.mount(entry.Route.options.component)
return ${stateScript}`,
    )
    const result = run.result as {
      html?: string
      inits: { shared: number; local: number }
      routeShared: { shared: number; local: number }
    }
    return {
      placement: {
        route: app.where('MARK_ROUTE'),
        component: app.where('MARK_COMPONENT'),
      },
      html: env === 'ssr' ? result.html! : run.html!,
      inits: result.inits,
      routeShared: result.routeShared,
      frameworks: Object.fromEntries(
        frameworks.map((name) => [
          name,
          app.chunks.some((chunk) => frameworkMarkers[name].test(chunk.code)),
        ]),
      ) as Record<Framework, boolean>,
      logs: run.logs,
    }
  } finally {
    await app.dispose()
  }
}

describe.each(bundlers)('%s', (bundler) => {
  describe.each(frameworks)('%s', (framework) => {
    describe.each(['ssr', 'client'] as const)('%s build', (env) => {
      test(
        'the split component loads lazily and renders',
        async () => {
          const result = await cachedBuild(bundler, framework, env)
          expect(result.placement).toEqual({
            route: 'eager',
            component: 'lazy',
          })
          expect(result.html).toContain('MARK_COMPONENT 1 1')
        },
        timeout,
      )

      test(
        'module state shared by the route and the component is initialised once',
        async () => {
          const result = await cachedBuild(bundler, framework, env)
          expect(result.inits).toEqual({ shared: 1, local: 1 })
          expect(result.routeShared).toEqual({ shared: 1, local: 1 })
        },
        timeout,
      )

      test(
        'the bundle holds no other framework',
        async () => {
          const result = await cachedBuild(bundler, framework, env)
          expect(result.frameworks).toEqual(
            Object.fromEntries(
              frameworks.map((name) => [name, name === framework]),
            ),
          )
        },
        timeout,
      )
    })
  })
})
