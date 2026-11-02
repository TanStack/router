// Generates the route modules of the example from `template/` and the
// application files that list them, then generates and publishes every module
// in dependency order, with ordinary TypeScript declaration builds.
//
//   pnpm gen [--modules <count>] [--routes <count per feature module>]
//            [--transpiled] [--if-missing]
//
// `--if-missing` keeps the modules of an earlier run: `dev` and `build`
// generate the default modules only in a fresh checkout.
//
// `--transpiled` ships every module as JavaScript, the way a module built to
// transpiled ESM would: after publishing its types, each module's TypeScript
// sources are replaced with their oxc output and its manifest lists the
// JavaScript route files. The application still code-splits and compiles
// them. Comparing builds with and without it measures what prebuilding the
// modules that way saves.
//
// The modules are packages in `modules/`, linked like workspace packages:
// `modules/node_modules/<name>` for the modules that use each other and
// `app/node_modules` for the application. They resolve everything else from
// the example's own dependencies.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Generator, getConfig } from '@tanstack/router-generator'
import { transformWithOxc } from 'vite'

const { values } = parseArgs({
  options: {
    modules: { type: 'string', default: '50' },
    routes: { type: 'string', default: '10' },
    transpiled: { type: 'boolean', default: false },
    'if-missing': { type: 'boolean', default: false },
  },
})
const featureCount = Number(values.modules)
const routeCount = Number(values.routes)
// Every feature has a layout, an item list, an item and a search route, and
// fills the rest with pages.
const pageCount = routeCount - 4
if (!Number.isInteger(featureCount) || featureCount < 1) {
  throw new Error('--modules must be a positive integer')
}
if (!Number.isInteger(routeCount) || pageCount < 1) {
  throw new Error('--routes must be an integer of at least 5')
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templateDir = path.join(root, 'template')
const modulesDir = path.join(root, 'modules')
const appDir = path.join(root, 'app')
const scope = '@large-route-modules'

if (
  values['if-missing'] &&
  existsSync(path.join(appDir, 'route-modules.gen.ts'))
) {
  process.exit(0)
}

const features = Array.from({ length: featureCount }, (_, index) => ({
  name: `feature-${index}`,
  title: `Feature ${index}`,
}))

async function listFiles(dir, base = dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)))
    } else {
      files.push(path.relative(base, full))
    }
  }
  return files
}

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

function replaceAll(content, replacements) {
  let result = content
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value)
  }
  return result
}

function modulePackageJson({ name, dependencies = {} }) {
  return {
    name: `${scope}/${name}`,
    private: true,
    type: 'module',
    tanstack: { router: { module: { uses: Object.keys(dependencies) } } },
    exports: {
      './route-types': {
        types: './.tanstack/types/src/routeContract.gen.d.ts',
      },
      './route-module': {
        types: './.tanstack/types/src/routeModule.gen.d.ts',
        default: './src/routeModule.gen.ts',
      },
      './package.json': './package.json',
    },
    dependencies: {
      ...dependencies,
      '@tanstack/react-router': '*',
      '@tanstack/react-start': '*',
      react: '*',
    },
  }
}

const moduleTsconfig = {
  compilerOptions: {
    strict: true,
    esModuleInterop: true,
    jsx: 'react-jsx',
    target: 'ESNext',
    moduleResolution: 'Bundler',
    module: 'ESNext',
    lib: ['DOM', 'DOM.Iterable', 'ES2022'],
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
  include: ['src'],
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

async function writeModule(name, templateName, packageJson, replacements) {
  const dir = path.join(modulesDir, name)
  const template = path.join(templateDir, templateName)
  for (const file of await listFiles(template)) {
    const content = await readFile(path.join(template, file), 'utf8')
    if (file === path.join('src', 'routes', 'pages', 'page.tsx')) {
      for (let page = 0; page < pageCount; page++) {
        await write(
          path.join(dir, 'src', 'routes', 'pages', `page-${page}.tsx`),
          replaceAll(content, {
            ...replacements,
            __NEXT_PAGE__: String((page + 1) % pageCount),
            __PAGE__: String(page),
          }),
        )
      }
    } else {
      await write(path.join(dir, file), replaceAll(content, replacements))
    }
  }
  await write(path.join(dir, 'package.json'), json(packageJson))
  await write(path.join(dir, 'tsconfig.json'), json(moduleTsconfig))
  await write(
    path.join(dir, 'tsconfig.route-types.json'),
    json({
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        noEmitOnError: true,
        declarationMap: true,
        rootDir: '.',
        outDir: '.tanstack/types',
      },
    }),
  )
  await symlink(
    path.join('..', '..', name),
    path.join(modulesDir, 'node_modules', scope, name),
    'dir',
  )
}

async function runPool(items, concurrency, task) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        await task(queue.shift())
      }
    }),
  )
}

async function generate(name) {
  const dir = path.join(modulesDir, name)
  const config = getConfig({ disableLogging: true }, dir)
  await new Generator({ config, root: dir }).run()
}

async function emitTypes(name) {
  const packageRoot = path.join(modulesDir, name)
  await rm(path.join(packageRoot, '.tanstack/types'), {
    recursive: true,
    force: true,
  })
  await new Promise((resolve, reject) => {
    const child = spawn(
      path.join(
        root,
        'node_modules/.bin',
        process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
      ),
      ['-p', 'tsconfig.route-types.json', '--pretty', 'false'],
      {
        cwd: packageRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    )
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Declaration build of ${name} exited with ${code}`))
      }
    })
  })
}

const started = performance.now()

await rm(modulesDir, { recursive: true, force: true })
await rm(path.join(appDir, 'node_modules'), { recursive: true, force: true })
await mkdir(path.join(modulesDir, 'node_modules', scope), { recursive: true })
await mkdir(path.join(appDir, 'node_modules'), { recursive: true })
await symlink(
  path.join('..', '..', 'modules', 'node_modules', scope),
  path.join(appDir, 'node_modules', scope),
  'dir',
)

await writeModule(
  'account',
  'account',
  modulePackageJson({ name: 'account' }),
  {},
)
for (const feature of features) {
  await writeModule(
    feature.name,
    'feature',
    modulePackageJson({
      name: feature.name,
      dependencies: { [`${scope}/account`]: 'link:../account' },
    }),
    { __MODULE_ID__: `${scope}/${feature.name}`, __TITLE__: feature.title },
  )
}

// The application depends on every module it installs.
const moduleIds = ['account', ...features.map((feature) => feature.name)].map(
  (name) => `${scope}/${name}`,
)
await write(
  path.join(appDir, 'package.json'),
  json({
    name: `${scope}/app`,
    private: true,
    type: 'module',
    dependencies: {
      ...Object.fromEntries(
        moduleIds.map((id) => [
          id,
          `link:../modules/${id.slice(scope.length + 1)}`,
        ]),
      ),
      '@tanstack/react-router': '*',
      '@tanstack/react-start': '*',
      react: '*',
      'react-dom': '*',
    },
  }),
)
await write(
  path.join(appDir, 'route-modules.gen.ts'),
  `// Written by \`pnpm gen\`: the modules the application installs.
export const routeModules = {
  includes: ${JSON.stringify(
    moduleIds.map((module) => ({
      module,
      at: `/${module.slice(scope.length + 1)}`,
    })),
    null,
    2,
  ).replaceAll('\n', '\n  ')},
}
`,
)
const namespace = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase())
await write(
  path.join(appDir, 'src', 'moduleIndex.gen.tsx'),
  `// Written by \`pnpm gen\`: a link to every feature module.
import { ${features.map((feature) => namespace(feature.name)).join(', ')} } from './routeScope.gen'

export const moduleIndex = [
${features
  .map(
    (feature) =>
      `  { name: '${feature.name}', link: <${namespace(feature.name)}.Link to="/">${feature.title}</${namespace(feature.name)}.Link> },`,
  )
  .join('\n')}
]
`,
)

// The features use the account module: it is published first.
await generate('account')
await emitTypes('account')
for (const feature of features) {
  await generate(feature.name)
}
await runPool(
  features.map((feature) => feature.name),
  os.availableParallelism(),
  emitTypes,
)

async function transpile(name) {
  const dir = path.join(modulesDir, name)
  const src = path.join(dir, 'src')
  for (const file of await listFiles(src)) {
    if (!/\.tsx?$/.test(file)) {
      continue
    }
    const source = path.join(src, file)
    const result = await transformWithOxc(
      await readFile(source, 'utf8'),
      source,
      { jsx: { runtime: 'automatic' } },
    )
    await writeFile(source.replace(/\.tsx?$/, '.js'), result.code)
    await rm(source)
  }
  const manifestPath = path.join(dir, '.tanstack', 'route-module.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const routeFile of manifest.routeFiles) {
    routeFile.file = routeFile.file.replace(/\.tsx?$/, '.js')
  }
  for (const tree of manifest.clientTrees) {
    tree.file = tree.file.replace(/\.tsx?$/, '.js')
    tree.clientFile = tree.clientFile.replace(/\.tsx?$/, '.js')
  }
  await writeFile(manifestPath, json(manifest))
  const packageJsonPath = path.join(dir, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  packageJson.exports['./route-module'].default = './src/routeModule.gen.js'
  await writeFile(packageJsonPath, json(packageJson))
}

if (values.transpiled) {
  await runPool(
    ['account', ...features.map((feature) => feature.name)],
    os.availableParallelism(),
    transpile,
  )
}

const seconds = ((performance.now() - started) / 1000).toFixed(1)
console.log(
  `Generated ${featureCount} feature modules with ${routeCount} routes each, plus the account module${values.transpiled ? ', as transpiled JavaScript,' : ''} in ${seconds}s.`,
)
if (!existsSync(path.join(appDir, 'src', 'routeTree.gen.ts'))) {
  console.log(
    'The application generates its route tree on `pnpm dev` or `pnpm build`.',
  )
}
