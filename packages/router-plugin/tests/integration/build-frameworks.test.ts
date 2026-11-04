/**
 * Real builds of a code-split route per bundler and framework: the split
 * component loads lazily and renders, module state the route and the
 * component share is initialised once, and the bundle holds only the
 * target framework: by provenance (the packages the bundle's modules come
 * from, as the bundler's own source maps record them, and the packages it
 * leaves for the runtime to load), not by fingerprints of a framework's
 * code.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSync } from 'vite'
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

/** The packages of each framework: its runtime and its router package. */
const frameworkPackages: Record<Framework, RegExp> = {
  react: /^(?:react|react-dom|scheduler|@tanstack\/react-[\w-]+)$/,
  solid: /^(?:solid-js|@tanstack\/solid-[\w-]+)$/,
  vue: /^(?:vue|@vue\/[\w-]+|@tanstack\/vue-[\w-]+)$/,
}

/** The package an absolute module path belongs to (nearest package.json). */
function packageOf(file: string): string | undefined {
  const installed = [
    ...file.matchAll(/[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/g),
  ].at(-1)
  if (installed) {
    return installed[1]!.replaceAll('\\', '/')
  }
  for (let dir = path.dirname(file); dir !== path.dirname(dir); ) {
    const manifest = path.join(dir, 'package.json')
    if (existsSync(manifest)) {
      return (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string })
        .name
    }
    dir = path.dirname(dir)
  }
  return undefined
}

/** The package name of a bare module request (`react-dom/client`: `react-dom`). */
const requestedPackage = (request: string) =>
  /^(?:@[^/]+\/)?[^/.][^/]*/.exec(request)?.[0]

/**
 * The packages a bundle holds or loads: the package of every module its
 * source maps name (the modules the bundler put in it), and of every bare
 * module request it leaves for the runtime (an SSR build's external React:
 * static and dynamic imports, `require` calls).
 */
function bundlePackages(app: Awaited<ReturnType<typeof build>>) {
  const packages = new Set<string>()
  for (const chunk of app.chunks) {
    const chunkDir = path.dirname(path.join(app.outDir, chunk.fileName))
    for (const source of chunk.map?.sources ?? []) {
      // webpack and Rspack name sources `webpack://<namespace>/./<path>`
      // from the app root; Vite relative to the chunk
      const bundlerSource = /^webpack:\/\/[^/]*\/(.*)$/.exec(source)
      const file = bundlerSource
        ? path.resolve(app.root, bundlerSource[1]!.split('?')[0]!)
        : path.resolve(chunkDir, source.split('?')[0]!)
      const name = packageOf(file)
      if (name) {
        packages.add(name)
      }
    }
    const { module, program } = parseSync('chunk.js', chunk.code, {
      sourceType: 'module',
    })
    const requests = [
      ...module.staticImports.map((entry) => entry.moduleRequest.value),
      ...module.staticExports.flatMap((entry) =>
        entry.entries.flatMap((item) =>
          item.moduleRequest ? [item.moduleRequest.value] : [],
        ),
      ),
    ]
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') {
        return
      }
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      const value = node as Record<string, any>
      if (
        (value.type === 'ImportExpression' &&
          value.source?.type === 'Literal') ||
        (value.type === 'CallExpression' &&
          value.callee?.type === 'Identifier' &&
          value.callee.name === 'require' &&
          value.arguments?.[0]?.type === 'Literal')
      ) {
        const literal = value.source ?? value.arguments[0]
        if (typeof literal.value === 'string') {
          requests.push(literal.value)
        }
      }
      for (const key of Object.keys(value)) {
        visit(value[key])
      }
    }
    visit(program)
    for (const request of requests) {
      const name = requestedPackage(request)
      if (name && !request.startsWith('node:')) {
        packages.add(name)
      }
    }
  }
  return packages
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
    // the rendering, and which framework packages the bundle holds.
    ...(bundler === 'webpack' && { minify: false }),
    // The bundler's record of which modules it put in each chunk
    sourcemap: true,
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
      frameworks: (() => {
        const packages = [...bundlePackages(app)]
        return Object.fromEntries(
          frameworks.map((name) => [
            name,
            packages.filter((item) => frameworkPackages[name].test(item)),
          ]),
        ) as Record<Framework, Array<string>>
      })(),
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
          // The target framework's packages are there (the provenance is
          // read), no other framework's
          expect(result.frameworks[framework].length).toBeGreaterThan(0)
          expect(
            Object.fromEntries(
              frameworks
                .filter((name) => name !== framework)
                .map((name) => [name, result.frameworks[name]]),
            ),
          ).toEqual(
            Object.fromEntries(
              frameworks
                .filter((name) => name !== framework)
                .map((name) => [name, []]),
            ),
          )
        },
        timeout,
      )
    })
  })
})
