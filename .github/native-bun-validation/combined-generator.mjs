import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  Generator,
  getConfig,
} from '../../packages/router-generator/dist/esm/index.js'

const normalize = (filename) => path.resolve(filename).replaceAll('\\', '/')
const cases = ['js', 'mjs', 'cjs', 'json'].flatMap((ext) =>
  [1, 2].map((depth) => ({ ext, depth, dynamic: false })),
)
cases.push({ ext: 'mjs', depth: 2, dynamic: true })
const results = []
const routeNames = ['before', 'after', 'replacement']
const configSource = (file, dynamic) =>
  file.endsWith('.cjs')
    ? `const routes = require(${JSON.stringify(file)}); export default routes\n`
    : dynamic
      ? `export default (await import(${JSON.stringify(file)})).default\n`
      : `import routes from ${JSON.stringify(file)}; export default routes\n`
const routeConfig = (name) => ({
  type: 'root',
  file: '__root.tsx',
  children: [{ type: 'route', path: `/${name}`, file: `${name}.tsx` }],
})
const helperSource = (ext, name) =>
  ext === 'json'
    ? JSON.stringify(routeConfig(name))
    : ext === 'cjs'
      ? `module.exports = ${JSON.stringify(routeConfig(name))}\n`
      : `export default ${JSON.stringify(routeConfig(name))}\n`

for (const scenario of cases) {
  const root = await mkdtemp(path.join(tmpdir(), 'router-built-helper-'))
  const checks = []
  const record = (name, passed, details = undefined) =>
    checks.push({ name, passed, details })
  try {
    const projects = []
    for (const id of ['a', 'b']) {
      const project = path.join(root, id)
      const routes = path.join(project, 'routes')
      await mkdir(routes, { recursive: true })
      await writeFile(path.join(project, 'package.json'), '{"type":"module"}\n')
      await writeFile(
        path.join(routes, '__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute({})\n`,
      )
      for (const suffix of routeNames) {
        const name = `${id}-${suffix}`
        await writeFile(
          path.join(routes, `${name}.tsx`),
          `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/${name}')({})\n`,
        )
      }
      const filename = path.join(project, `helper.${scenario.ext}`)
      const configFile = path.join(project, 'virtual-routes.ts')
      const bridge = path.join(project, 'bridge.ts')
      await writeFile(filename, helperSource(scenario.ext, `${id}-before`))
      await writeFile(
        configFile,
        configSource(
          scenario.depth === 2 ? './bridge.ts' : `./helper.${scenario.ext}`,
          false,
        ),
      )
      if (scenario.depth === 2) {
        await writeFile(
          bridge,
          configSource(`./helper.${scenario.ext}`, scenario.dynamic),
        )
      }
      const generatedRouteTree = path.join(project, 'routeTree.gen.ts')
      const generator = new Generator({
        root: project,
        config: getConfig(
          {
            routesDirectory: routes,
            generatedRouteTree,
            virtualRouteConfig: 'virtual-routes.ts',
            tmpDir: path.join(project, 'tmp'),
            disableLogging: true,
          },
          project,
        ),
      })
      projects.push({
        id,
        project,
        filename,
        configFile,
        bridge,
        generatedRouteTree,
        generator,
      })
    }
    const [a, b] = projects
    await Promise.all(projects.map((project) => project.generator.run()))
    const expectedFiles = (project) =>
      [
        project.configFile,
        ...(scenario.depth === 2 ? [project.bridge] : []),
        project.filename,
      ]
        .map(normalize)
        .sort()
    for (const project of projects) {
      const deps = project.generator
        .getWatchDependencies()
        .files.map(normalize)
        .sort()
      record(
        `${project.id}:watch-dependencies`,
        JSON.stringify(deps) === JSON.stringify(expectedFiles(project)),
        {
          expected: expectedFiles(project).map((filename) =>
            path.relative(root, filename),
          ),
          actual: deps.map((filename) => path.relative(root, filename)),
        },
      )
      record(
        `${project.id}:initial-tree`,
        (await readFile(project.generatedRouteTree, 'utf8')).includes(
          `'/${project.id}-before'`,
        ),
      )
    }
    const initialB = await readFile(b.generatedRouteTree, 'utf8')
    const stableA = await readFile(a.generatedRouteTree, 'utf8')
    await a.generator.run()
    record(
      'a:unchanged-generation',
      (await readFile(a.generatedRouteTree, 'utf8')) === stableA,
    )
    await writeFile(a.filename, helperSource(scenario.ext, 'a-after'))
    await a.generator.run({ path: a.filename, type: 'update' })
    const eventTree = await readFile(a.generatedRouteTree, 'utf8')
    record(
      'a:in-place-update-event',
      eventTree.includes("'/a-after'") && !eventTree.includes("'/a-before'"),
    )
    await a.generator.run()
    const rerunTree = await readFile(a.generatedRouteTree, 'utf8')
    record(
      'a:in-place-unconditional-rerun',
      rerunTree.includes("'/a-after'") && !rerunTree.includes("'/a-before'"),
    )
    record(
      'b:unchanged-after-a-edit',
      (await readFile(b.generatedRouteTree, 'utf8')) === initialB,
    )
    await writeFile(
      `${a.filename}.next`,
      helperSource(scenario.ext, 'a-replacement'),
    )
    await rename(`${a.filename}.next`, a.filename)
    await a.generator.run({ path: a.filename, type: 'update' })
    const replaced = await readFile(a.generatedRouteTree, 'utf8')
    record(
      'a:atomic-replacement-event',
      replaced.includes("'/a-replacement'") && !replaced.includes("'/a-after'"),
    )
    await writeFile(b.filename, helperSource(scenario.ext, 'b-after'))
    await b.generator.run({ path: b.filename, type: 'update' })
    record(
      'b:independent-update-event',
      (await readFile(b.generatedRouteTree, 'utf8')).includes("'/b-after'"),
    )
    await a.generator.run()
    record(
      'a:no-cross-generator-leakage',
      (await readFile(a.generatedRouteTree, 'utf8')) === replaced,
    )
    record(
      'watch-dependencies-remain-isolated',
      projects.every((project) => {
        const deps = project.generator
          .getWatchDependencies()
          .files.map(normalize)
        return (
          JSON.stringify(deps.sort()) === JSON.stringify(expectedFiles(project))
        )
      }),
    )
  } catch (error) {
    record(
      'execution',
      false,
      error instanceof Error ? error.stack : String(error),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
  results.push({
    ...scenario,
    passed: checks.every((check) => check.passed),
    checks,
  })
}
const report = {
  runtime: {
    bun: process.versions.bun ?? null,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  },
  mode: process.env.JITI_COMBINED_MODE ?? 'installed',
  generator: 'packages/router-generator/dist/esm/index.js',
  cases: results.length,
  passed: results.filter((result) => result.passed).length,
  results,
}
console.log(JSON.stringify(report, null, 2))
if (report.passed !== report.cases) {
  process.exitCode = 1
}
