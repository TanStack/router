// Records main's server-fn output formats for the golden app
// (`tests/server-fn-format-golden.ts`) into `main-formats.json`, which
// `tests/integration/start-build-server-fn-format.test.ts` compares with.
//
// Regenerate (only when the formats the next major ships are decided, or the
// golden app changes):
//
//   git worktree add --detach /var/tmp/sfcompat-main <main commit>
//   cd /var/tmp/sfcompat-main && CI=1 pnpm install --frozen-lockfile
//   CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-start:build --skipRemoteCache
//   node <this checkout>/packages/start-plugin-core/tests/integration/fixtures/server-fn-format-main/record.mjs \
//     /var/tmp/sfcompat-main/e2e/react-start/server-functions
//
// It writes the golden files, a `/compat` route calling the client fns and
// a `start-mode-config.ts` choosing the generator from `COMPAT_IDS` into
// that app (and its route tree through the build), builds it with Vite and
// with Rsbuild, without a generator (`none`) and with the golden one
// (`custom`), and extracts what the golden server fns look like in each
// output. Node >= 23.6 (type stripping of the golden module).
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractServerFnFormat,
  goldenClientImports,
  goldenFiles,
  goldenGenerateFunctionId,
} from '../../../server-fn-format-golden.ts'

const app = path.resolve(process.argv[2] ?? '')
const here = path.dirname(fileURLToPath(import.meta.url))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: app })
  .toString()
  .trim()

rmSync(path.join(app, 'src/compat'), { recursive: true, force: true })
for (const [file, code] of Object.entries(goldenFiles)) {
  mkdirSync(path.dirname(path.join(app, file)), { recursive: true })
  writeFileSync(path.join(app, file), code)
}
const imports = Object.entries(goldenClientImports)
const calls = imports.flatMap(([, names]) => names.map((n) => `${n}()`))
writeFileSync(
  path.join(app, 'src/routes/compat.tsx'),
  `import { createFileRoute } from '@tanstack/react-router'
${imports.map(([from, names]) => `import { ${names.join(', ')} } from '.${from}'`).join('\n')}

export const Route = createFileRoute('/compat')({
  loader: async () => ({ results: await Promise.all([${calls.join(', ')}]) }),
  component: Compat,
})

function Compat() {
  const { results } = Route.useLoaderData()
  return <pre data-testid="compat">{JSON.stringify(results)}</pre>
}
`,
)
const original = execFileSync(
  'git',
  ['show', 'HEAD:e2e/react-start/server-functions/start-mode-config.ts'],
  { cwd: app },
).toString()
writeFileSync(
  path.join(app, 'start-mode-config.ts'),
  `${original.replace('export function getStartModeConfig', 'function appStartModeConfig')}
const golden = ${goldenGenerateFunctionId.toString()}

export function getStartModeConfig() {
  if (process.env.COMPAT_IDS === 'none') {
    return {}
  }
  if (process.env.COMPAT_IDS === 'custom') {
    return { serverFns: { generateFunctionId: golden } }
  }
  return appStartModeConfig()
}
`,
)

function jsFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.[cm]?js$/.test(e.name))
    .map((e) => readFileSync(path.join(e.parentPath, e.name), 'utf8'))
}

const records = {}
for (const bundler of ['vite', 'rsbuild']) {
  records[bundler] = {}
  for (const mode of ['none', 'custom']) {
    const outDir = `dist-golden-${bundler}-${mode}`
    rmSync(path.join(app, outDir), { recursive: true, force: true })
    execFileSync('pnpm', ['exec', bundler, 'build'], {
      cwd: app,
      stdio: 'inherit',
      env: {
        ...process.env,
        COMPAT_IDS: mode,
        E2E_DIST_DIR: outDir,
        E2E_RSBUILD_BUILD_CACHE: 'false',
        NODE_ENV: 'production',
      },
    })
    records[bundler][mode] = extractServerFnFormat(
      jsFiles(path.join(app, outDir, 'server')),
      jsFiles(path.join(app, outDir, 'client')),
    )
  }
}
writeFileSync(
  path.join(here, 'main-formats.json'),
  `${JSON.stringify({ commit, records }, null, 2)}\n`,
)
