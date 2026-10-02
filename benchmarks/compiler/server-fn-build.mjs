import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilerFingerprint } from './provenance.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const workspace = path.resolve(
  option('--workspace', fileURLToPath(new URL('../../', import.meta.url))),
)
const baseline = option('--baseline')
const functions = Number(option('--functions', '1000'))
const perModule = Number(option('--per-module', '10'))
const repetitions = Number(option('--repetitions', '7'))
for (const count of [functions, perModule, repetitions]) {
  assert.ok(Number.isSafeInteger(count) && count > 0)
}
const hash = (value) => createHash('sha256').update(value).digest('hex')

if (!args.includes('--worker')) {
  const samples = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const variants = baseline
      ? [
          ['baseline', path.resolve(baseline)],
          ['candidate', workspace],
        ]
      : [['candidate', workspace]]
    if (repetition % 2) {
      variants.reverse()
    }
    for (const [variant, root] of variants) {
      const result = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          fileURLToPath(import.meta.url),
          '--worker',
          '--workspace',
          root,
          '--functions',
          String(functions),
          '--per-module',
          String(perModule),
        ],
        {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'production' },
        },
      )
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      const line = result.stdout
        .split('\n')
        .find((line) => line.startsWith('BENCHMARK_JSON='))
      assert.ok(line, result.stdout)
      const sample = { variant, repetition, ...JSON.parse(line.slice(15)) }
      samples.push(sample)
      process.stderr.write(
        `${variant} ${repetition + 1}/${repetitions}: ${sample.buildMs.toFixed(1)} ms\n`,
      )
    }
  }
  assert.ok(
    samples.every((sample) => sample.sourceHash === samples[0].sourceHash),
    'Source mismatch',
  )
  assert.ok(
    samples.every((sample) => sample.outputHash === samples[0].outputHash),
    'Normalized output mismatch',
  )
  assert.ok(
    samples.every((sample) => sample.clientHash === samples[0].clientHash),
    'Client output mismatch',
  )
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const summary = [...new Set(samples.map((sample) => sample.variant))].map(
    (variant) => {
      const group = samples.filter((sample) => sample.variant === variant)
      for (const sample of group) {
        assert.deepEqual(
          sample.compilerFingerprint,
          group[0].compilerFingerprint,
          'Compiler changed during measurements',
        )
      }
      const values = group.map((sample) => sample.buildMs)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sd = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          Math.max(1, values.length - 1),
      )
      return {
        variant,
        medianBuildMs: median(values),
        meanBuildMs: mean,
        sdMs: sd,
        cvPercent: (sd / mean) * 100,
        medianPeakRssMiB: median(group.map((sample) => sample.peakRssMiB)),
      }
    },
  )
  const output = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      node: process.version,
      cpu: cpus()[0].model,
      functions,
      perModule,
      repetitions,
      summary,
      samples,
    },
    null,
    2,
  )
  if (option('--output')) {
    await writeFile(option('--output'), `${output}\n`)
  } else {
    console.log(output)
  }
} else {
  const { createBuilder } = await import(
    pathToFileURL(path.join(workspace, 'node_modules/vite/dist/node/index.js'))
      .href
  )
  const { tanstackStart } = await import(
    pathToFileURL(
      path.join(workspace, 'packages/react-start/dist/esm/plugin/vite.js'),
    ).href
  )
  const { default: viteReact } = await import(
    pathToFileURL(
      path.join(
        workspace,
        'e2e/react-start/server-functions/node_modules/@vitejs/plugin-react/dist/index.js',
      ),
    ).href
  )
  const directory = await mkdtemp(
    path.join(
      workspace,
      'e2e/react-start/server-functions/.compiler-benchmark-',
    ),
  )
  const sourceHasher = createHash('sha256')
  const source = async (file, code) => {
    sourceHasher.update(file).update('\0').update(code).update('\0')
    await writeFile(path.join(directory, file), code)
  }
  try {
    await mkdir(path.join(directory, 'src/routes'), { recursive: true })
    await mkdir(path.join(directory, 'src/functions'))
    await source('package.json', '{"type":"module","private":true}')
    await source(
      'src/router.tsx',
      `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() { return createRouter({ routeTree }) }`,
    )
    await source(
      'src/routes/__root.tsx',
      `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() { return <html><head><HeadContent /></head><body><Outlet /><Scripts /></body></html> }`,
    )
    const imports = []
    const names = []
    for (let offset = 0; offset < functions; offset += perModule) {
      const moduleNames = []
      const declarations = []
      for (let i = offset; i < Math.min(offset + perModule, functions); i++) {
        const name = `serverFn_${i}`
        names.push(name)
        moduleNames.push(name)
        declarations.push(
          `export const ${name} = createServerFn({ method: 'POST' }).validator((data: number) => data).handler(async ({ data }) => ({ marker: 'server-only-result-${i}', value: data + ${i} }))`,
        )
      }
      const filename = `group-${offset / perModule}`
      await source(
        `src/functions/${filename}.ts`,
        `import { createServerFn } from '@tanstack/react-start'\n${declarations.join('\n')}`,
      )
      imports.push(
        `import { ${moduleNames.join(', ')} } from '../functions/${filename}'`,
      )
    }
    await source(
      'src/routes/index.tsx',
      `import { createFileRoute } from '@tanstack/react-router'
${imports.join('\n')}
const functions = [${names.join(', ')}]
export const Route = createFileRoute('/')({ component: Index })
function Index() { return <main>{functions.map((fn, index) => <button key={index} onClick={async () => { console.log(await fn({ data: index })) }}>Call {index}</button>)}</main> }`,
    )
    process.chdir(directory)
    global.gc()
    const started = performance.now()
    const builder = await createBuilder({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackStart({
          serverFns: {
            generateFunctionId: ({ functionName }) => `bench_${functionName}`,
          },
        }),
        viteReact(),
      ],
    })
    await builder.buildApp()
    const buildMs = performance.now() - started
    const peakRssMiB = process.resourceUsage().maxRSS / 1024
    // Validation and hashing run after the timed production build.
    const outputs = []
    for (const [environment, build] of Object.entries(builder.environments)) {
      const outDir = path.resolve(directory, build.config.build.outDir)
      for (const file of (await readdir(outDir, { recursive: true })).sort()) {
        if (file.endsWith('.js')) {
          outputs.push({
            environment,
            file,
            code: await readFile(path.join(outDir, file), 'utf8'),
          })
        }
      }
    }
    const client = outputs.filter((output) => output.environment === 'client')
    const server = outputs.filter((output) => output.environment !== 'client')
    const clientCode = client.map((output) => output.code).join('\n')
    const serverCode = server.map((output) => output.code).join('\n')
    assert.ok(client.length > 0 && server.length > 0)
    const expectedIds = names
      .map((name) => `bench_${name}_createServerFn_handler`)
      .sort()
    const rpcIds = (code) =>
      [
        ...new Set(
          [...code.matchAll(/bench_serverFn_\d+_createServerFn_handler/g)].map(
            (match) => match[0],
          ),
        ),
      ].sort()
    assert.deepEqual(
      rpcIds(clientCode),
      expectedIds,
      'Client RPCs were eliminated',
    )
    assert.deepEqual(
      rpcIds(serverCode),
      expectedIds,
      'Server RPCs were eliminated',
    )
    assert.ok(
      !clientCode.includes('server-only-result-'),
      'Server handler leaked into client',
    )
    const retainedFunctions = new Set(
      [...serverCode.matchAll(/server-only-result-(\d+)/g)].map((match) =>
        Number(match[1]),
      ),
    )
    assert.equal(
      retainedFunctions.size,
      functions,
      'Server functions were eliminated',
    )
    for (let i = 0; i < functions; i++) {
      assert.ok(retainedFunctions.has(i))
    }
    // Only normalize checkout/temp roots and references to content-hashed output
    // filenames. The complete normalized JavaScript body still enters the hash.
    const filenames = new Map(
      outputs.map(({ file }) => [
        path.basename(file),
        path.basename(file).replace(/-[\w-]{8}\.js$/, '-[hash].js'),
      ]),
    )
    const normalize = (value) => {
      let normalized = value
        .replaceAll(directory, '<app>')
        .replaceAll(workspace, '<workspace>')
      for (const [name, replacement] of filenames) {
        normalized = normalized.replaceAll(name, replacement)
      }
      return normalized
    }
    const normalized = outputs
      .map(({ environment, file, code }) => [
        environment,
        normalize(file),
        normalize(code),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.equal(
      new Set(normalized.map(([env, file]) => `${env}/${file}`)).size,
      normalized.length,
      'Normalized filename collision',
    )
    const sample = {
      buildMs,
      peakRssMiB,
      sourceHash: sourceHasher.digest('hex'),
      outputHash: hash(JSON.stringify(normalized)),
      clientHash: hash(JSON.stringify(client)),
      retainedFunctions: retainedFunctions.size,
      javascriptFiles: outputs.length,
      clientFiles: client.length,
      javascriptBytes: outputs.reduce(
        (sum, output) => sum + Buffer.byteLength(output.code),
        0,
      ),
      compilerFingerprint: compilerFingerprint(workspace),
    }
    console.log(`BENCHMARK_JSON=${JSON.stringify(sample)}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
