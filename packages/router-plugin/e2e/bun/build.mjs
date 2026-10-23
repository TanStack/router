import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tanstackRouter, {
  tanstackRouter as namedTanstackRouter,
} from '@tanstack/router-plugin/bun'
import { verifyBunRouteSourceMaps } from './source-maps.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspace = path.resolve(here, '../../.cache/bun-e2e')
const fixture = path.join(workspace, 'fixture')
const generatedRouteTree = path.join(fixture, 'routeTree.gen.ts')

await rm(workspace, { recursive: true, force: true })
await mkdir(workspace, { recursive: true })
await cp(path.join(here, 'fixture'), fixture, { recursive: true })

const options = {
  target: 'react',
  routesDirectory: path.join(fixture, 'routes'),
  generatedRouteTree,
  tmpDir: path.join(workspace, 'tmp'),
  autoCodeSplitting: true,
  disableLogging: true,
}

const markers = [
  'HOME_NATIVE_BUN',
  'ABOUT_NATIVE_BUN',
  'DETAILS_DYNAMIC_BUN',
  'SECOND_BUILD_NATIVE_BUN',
  'EDITED_NATIVE_BUN',
]

const supportsInputSourceMaps = await verifyBunRouteSourceMaps()

async function build(name, plugin, beforePlugins = []) {
  const result = await Bun.build({
    entrypoints: [path.join(fixture, 'main.tsx')],
    outdir: path.join(workspace, name),
    target: 'browser',
    format: 'esm',
    splitting: true,
    minify: true,
    sourcemap: 'external',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [...beforePlugins, plugin],
  })
  if (!result.success) {
    throw new Error(result.logs.map(String).join('\n'))
  }
  const outputs = await Promise.all(
    result.outputs.map(async (output) => ({
      path: path
        .relative(path.join(workspace, name), output.path)
        .replaceAll('\\', '/'),
      kind: output.kind,
      source: await output.text(),
    })),
  )
  const routeSource = await readFile(
    path.join(fixture, 'routes/about.tsx'),
    'utf8',
  )
  return {
    name,
    routeTree: await readFile(generatedRouteTree, 'utf8'),
    routeSourceMaps: outputs
      .filter(
        ({ path, source }) =>
          path.endsWith('.js') && source.includes('ABOUT_NATIVE_BUN'),
      )
      .map((output) => {
        const prefix = output.source
          .slice(0, output.source.indexOf('ABOUT_NATIVE_BUN'))
          .split('\n')
        return {
          payload: JSON.parse(
            outputs.find(({ path }) => path === `${output.path}.map`).source,
          ),
          generatedLine: prefix.length - 1,
          generatedColumn: prefix.at(-1).length,
          originalSource: routeSource,
        }
      }),
    outputs: outputs.map(({ source, ...output }) => ({
      ...output,
      markers: output.path.endsWith('.js')
        ? markers.filter((marker) => source.includes(marker))
        : [],
    })),
  }
}

const reusedPlugin = tanstackRouter({
  ...options,
  codeSplittingOptions: { defaultBehavior: [['loader'], ['component']] },
})
const builds = [await build('initial', reusedPlugin)]

await writeFile(
  path.join(fixture, 'routes/second build.js'),
  `import { createFileRoute } from '@tanstack/react-router'
const shared = { value: <span>42</span> }
export const Route = createFileRoute('/second build')({
  loader: () => shared,
  component: () => <h1 data-shared-identity={Route.useLoaderData() === shared}>SECOND_BUILD_NATIVE_BUN</h1>,
})
`,
)
builds.push(await build('reused', reusedPlugin))

// Hold A after reference compilation, then start B while A still needs its
// shared bindings. Only public Bun hooks are used to control the overlap.
const aAtResolve = Promise.withResolvers()
const bStarted = Promise.withResolvers()
const releaseB = Promise.withResolvers()
const concurrentA = build('concurrent-a', reusedPlugin, [
  {
    name: 'pause-before-split-resolution',
    setup(build) {
      build.onEnd(() => {
        releaseB.resolve()
      })
      build.onResolve(
        { filter: /about\.tsx\?tsr-(split|shared)=/ },
        async () => {
          aAtResolve.resolve()
          await bStarted.promise
        },
      )
    },
  },
])
try {
  await Promise.race([
    aAtResolve.promise,
    concurrentA.then(() => {
      throw new Error(
        'Concurrent build completed without resolving route chunks',
      )
    }),
  ])
  const concurrentB = build('concurrent-b', reusedPlugin, [
    {
      name: 'pause-concurrent-build',
      setup(build) {
        build.onStart(() => {
          bStarted.resolve()
          return releaseB.promise
        })
      },
    },
  ])
  builds.push(...(await Promise.all([concurrentA, concurrentB])))
} finally {
  bStarted.resolve()
  releaseB.resolve()
}

await rm(generatedRouteTree)
builds.push(await build('independent', namedTanstackRouter(options)))

// Both files are valid TSX. A stale tree would still bundle successfully, so
// this conflict specifically verifies that generation errors reject the build.
await mkdir(path.join(fixture, 'routes/(duplicate)'), { recursive: true })
await writeFile(
  path.join(fixture, 'routes/(duplicate)/about.tsx'),
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/(duplicate)/about')({})
`,
)
let generationFailure
try {
  await build('invalid', reusedPlugin)
} catch (error) {
  generationFailure =
    error instanceof AggregateError
      ? [String(error), ...Array.from(error.errors, String)].join('\n')
      : String(error)
}
await rm(path.join(fixture, 'routes/(duplicate)/about.tsx'))
builds.push(await build('recovered', reusedPlugin))

await writeFile(
  path.join(fixture, 'routes/about.tsx'),
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({
  component: () => <h1>EDITED_NATIVE_BUN</h1>,
})
`,
)
await rm(path.join(fixture, 'routes/details.tsx'))
await rm(path.join(fixture, 'routes/details.lazy.tsx'))
builds.push(await build('edited', reusedPlugin))

const manifest = { builds, generationFailure, supportsInputSourceMaps }
if (!process.argv.includes('--serve')) {
  console.log(JSON.stringify(manifest, null, 2))
} else {
  const servedBuilds = builds.filter((build) =>
    ['concurrent-a', 'concurrent-b', 'independent', 'recovered'].includes(
      build.name,
    ),
  )
  const entrypoints = new Map(
    servedBuilds.map((build) => [
      build.name,
      build.outputs.find((output) => output.kind === 'entry-point').path,
    ]),
  )
  const assets = new Map(
    servedBuilds.flatMap((build) =>
      build.outputs.map((output) => [
        `/${build.name}/${output.path}`,
        Bun.file(path.join(workspace, build.name, output.path)),
      ]),
    ),
  )
  Bun.serve({
    hostname: '127.0.0.1',
    port: Number(process.env.E2E_APP_PORT ?? 43187),
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname
      if (pathname === '/__builds') {
        return Response.json(manifest)
      }
      const asset = assets.get(pathname)
      if (asset) {
        return new Response(asset, {
          headers: { 'Content-Type': 'text/javascript' },
        })
      }
      const buildName = url.searchParams.get('build') ?? 'recovered'
      const entrypoint = entrypoints.get(buildName)
      if (!entrypoint) {
        return new Response('Unknown build', { status: 404 })
      }
      return new Response(
        `<div id="app"></div><script type="module" src="/${buildName}/${entrypoint}"></script>`,
        { headers: { 'Content-Type': 'text/html' } },
      )
    },
  })
}
