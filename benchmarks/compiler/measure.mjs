import { compilerFingerprint } from './provenance.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultWorkspace = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const root = path.resolve(option('--workspace', defaultWorkspace))
const fixturesRoot = path.resolve(option('--fixtures-root', root))
const bindings = Number(option('--bindings', '0'))
assert.ok(Number.isSafeInteger(bindings) && bindings >= 0)
const repetitions = Number(option('--repetitions', '5'))
const iterations = Number(option('--iterations', '20'))
const warmups = Number(option('--warmups', '2'))
const mode = option('--worker', '')
const digestOutput = args.includes('--digest-output')
const yukuRoot = option('--yuku-root', path.join(root, 'packages/router-utils'))
for (const [name, value] of Object.entries({
  repetitions,
  iterations,
  warmups,
})) {
  assert.ok(
    Number.isSafeInteger(value) && value >= (name === 'warmups' ? 0 : 1),
    `${name} must be a valid integer`,
  )
}
const modes = option('--modes', 'yuku-roundtrip,yuku-splitter').split(',')
const fixtures =
  bindings > 0
    ? [
        {
          framework: 'react',
          filename: 'react/shared-destructuring.tsx',
          code: `import { createFileRoute } from '@tanstack/react-router';
const { ${Array.from({ length: bindings }, (_, index) => `value${index}`).join(',')} } = { ${Array.from({ length: bindings }, (_, index) => `value${index}: ${index}`).join(',')} };
const loader = () => [${Array.from({ length: bindings }, (_, index) => `value${index}`).join(',')}];
const Component = () => <div>{[${Array.from({ length: bindings }, (_, index) => `value${index}`).join(',')}].join(',')}</div>;
export const Route = createFileRoute('/wide')({ loader, component: Component });`,
        },
      ]
    : ['react', 'solid'].flatMap((framework) => {
        const directory = path.join(
          fixturesRoot,
          'packages/router-plugin/tests/code-splitter/test-files',
          framework,
        )
        return readdirSync(directory)
          .sort()
          .filter((name) => /\.[jt]sx?$/.test(name))
          .map((name) => ({
            framework,
            filename: `${framework}/${name}`,
            code: readFileSync(path.join(directory, name), 'utf8'),
          }))
      })
const fixtureHash = createHash('sha256')
for (const fixture of fixtures) {
  fixtureHash
    .update(fixture.filename)
    .update('\0')
    .update(fixture.code)
    .update('\0')
}
const corpus = {
  files: fixtures.length,
  bytes: fixtures.reduce(
    (sum, fixture) => sum + Buffer.byteLength(fixture.code),
    0,
  ),
  sha256: fixtureHash.digest('hex'),
}

if (!mode) {
  const samples = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    // Rotate order to reduce systematic temperature/background-work bias.
    for (let index = 0; index < modes.length; index++) {
      const selectedMode = modes[(index + repetition) % modes.length]
      const start = performance.now()
      const result = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          fileURLToPath(import.meta.url),
          '--worker',
          selectedMode,
          '--workspace',
          root,
          '--fixtures-root',
          fixturesRoot,
          '--iterations',
          String(iterations),
          '--bindings',
          String(bindings),
          '--warmups',
          String(warmups),
          '--yuku-root',
          yukuRoot,
          ...(digestOutput ? ['--digest-output'] : []),
        ],
        {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'production' },
        },
      )
      if (result.status !== 0) {
        throw new Error(
          `${selectedMode} failed: ${result.stderr}\n${result.stdout}`,
        )
      }
      const line = result.stdout
        .split('\n')
        .find((value) => value.startsWith('BENCHMARK_JSON='))
      assert.ok(line, `${selectedMode} did not emit its result`)
      const sample = JSON.parse(line.slice(15))
      assert.equal(
        sample.corpus.sha256,
        corpus.sha256,
        'Fixture corpus changed during measurement',
      )
      samples.push({
        repetition,
        wallMs: performance.now() - start,
        ...sample,
      })
    }
  }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const summary = Object.fromEntries(
    modes.map((selectedMode) => {
      const selected = samples.filter((sample) => sample.mode === selectedMode)
      return [
        selectedMode,
        {
          medianMsPerCorpus: median(
            selected.map((sample) => sample.elapsedMs / iterations),
          ),
          minMsPerCorpus: Math.min(
            ...selected.map((sample) => sample.elapsedMs / iterations),
          ),
          maxMsPerCorpus: Math.max(
            ...selected.map((sample) => sample.elapsedMs / iterations),
          ),
          medianPeakRssMiB: median(
            selected.map((sample) => sample.peakRssKiB / 1024),
          ),
          medianRetainedHeapMiB: median(
            selected.map((sample) => sample.retained.heapUsed / 1024 ** 2),
          ),
          medianWallMs: median(selected.map((sample) => sample.wallMs)),
          phasesMsPerCorpus: Object.fromEntries(
            Object.keys(selected[0].phases).map((phase) => [
              phase,
              median(
                selected.map((sample) => sample.phases[phase] / iterations),
              ),
            ]),
          ),
          countsPerCorpus: selected[0].counts,
        },
      ]
    }),
  )
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        compilerFingerprint: compilerFingerprint(root),
        workspace: root,
        fixturesRoot,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0].model,
        corpus,
        repetitions,
        iterations,
        diagnosticOnly: digestOutput,
        warmups,
        summary,
        samples,
      },
      null,
      2,
    ),
  )
} else {
  const phases = {}
  const counts = {}
  let outputBytes = 0
  let outputMapBytes = 0
  const outputDigest = digestOutput ? createHash('sha256') : null
  let resolvedReferences = 0
  let measuring = false
  const time = (phase, operation) => {
    const start = performance.now()
    const value = operation()
    if (measuring) {
      phases[phase] = (phases[phase] ?? 0) + performance.now() - start
    }
    return value
  }
  const count = (name, amount = 1) => {
    if (measuring) {
      counts[name] = (counts[name] ?? 0) + amount
    }
  }
  const consume = (result) => {
    outputBytes += Buffer.byteLength(result.code)
    assert.ok(result.map, 'Expected source map')
    const map = JSON.stringify(result.map)
    outputMapBytes += Buffer.byteLength(map)
    outputDigest?.update(result.code).update('\0').update(map).update('\0')
    count('outputs')
  }
  let execute
  if (mode === 'yuku-roundtrip') {
    assert.ok(
      yukuRoot,
      'Supply --yuku-root pointing at a directory with Yuku 0.11.0 installed',
    )
    const { analyze } = await import(
      pathToFileURL(path.join(yukuRoot, 'node_modules/yuku-analyzer/index.js'))
    )
    const { generate } = await import(
      pathToFileURL(path.join(yukuRoot, 'node_modules/yuku-codegen/index.js'))
    )
    execute = () => {
      for (const { code, filename } of fixtures) {
        const module = time('parseAnalyzeAndDecode', () => {
          const result = analyze(code, { path: filename, attachComments: true })
          assert.equal(result.diagnostics.length, 0)
          // The generator consumes the complete lazily decoded AST below.
          void result.ast
          return result
        })
        count('parses')
        time('semanticQueries', () => {
          for (const reference of module.references) {
            if (reference.symbol) {
              resolvedReferences += reference.symbol.name.length
            }
          }
        })
        consume(
          time('generate', () => {
            const result = generate(module.ast, {
              comments: 'all',
              sourceMap: {
                source: code,
                sourceFileName: filename,
                sourcesContent: code,
              },
            })
            assert.equal(result.errors.length, 0)
            return result
          }),
        )
      }
    }
  } else {
    const utils = await import(
      pathToFileURL(path.join(root, 'packages/router-utils/dist/esm/index.js'))
    )
    if (mode === 'babel-roundtrip') {
      const require = createRequire(
        path.join(root, 'packages/router-plugin/package.json'),
      )
      const babel = require('@babel/core')
      const generate = createRequire(
        path.join(root, 'packages/router-utils/package.json'),
      )('@babel/generator').default
      execute = () => {
        for (const { code, filename } of fixtures) {
          const ast = time('parse', () => utils.parseAst({ code, filename }))
          count('parses')
          time('scopeAnalysis', () =>
            babel.traverse(ast, {
              ReferencedIdentifier(identifier) {
                const binding = identifier.scope.getBinding(
                  identifier.node.name,
                )
                if (binding) {
                  resolvedReferences += binding.identifier.name.length
                }
              },
            }),
          )
          consume(
            time('generate', () =>
              generate(
                ast,
                {
                  filename,
                  sourceFileName: filename,
                  sourceMaps: true,
                  importAttributesKeyword: 'with',
                },
                code,
              ),
            ),
          )
        }
      }
    } else {
      assert.ok(
        ['babel-splitter', 'yuku-splitter', 'yuku-splitter-no-reuse'].includes(
          mode,
        ),
      )
      const compiler = await import(
        pathToFileURL(
          path.join(
            root,
            'packages/router-plugin/dist/esm/core/code-splitter/compilers.js',
          ),
        )
      )
      const groupings = [
        [['component'], ['errorComponent'], ['notFoundComponent']],
        [
          ['loader'],
          [
            'component',
            'pendingComponent',
            'errorComponent',
            'notFoundComponent',
          ],
        ],
        [
          ['loader', 'component', 'pendingComponent', 'notFoundComponent'],
          ['errorComponent'],
        ],
      ]
      execute = () => {
        for (const { code, filename, framework } of fixtures) {
          for (const fallback of groupings) {
            const analysis =
              mode === 'yuku-splitter'
                ? time('parseAnalyze', () =>
                    compiler.analyzeRouteModule({ code, filename }),
                  )
                : undefined
            if (analysis) {
              count('parses')
            }
            const detected = time('detectGroupings', () =>
              compiler.detectCodeSplitGroupingsFromRoute({
                code,
                filename,
                analysis,
              }),
            )
            count('parses', mode === 'yuku-splitter' ? 0 : 1)
            const codeSplitGroupings = detected.groupings ?? fallback
            const sharedBindings = time('sharedAnalysis', () =>
              compiler.computeSharedBindings({
                code,
                analysis,
                filename,
                codeSplitGroupings,
              }),
            )
            count('parses', mode === 'yuku-splitter' ? 0 : 1)
            const shared = sharedBindings.size > 0 ? sharedBindings : undefined
            const reference = time('referenceCompile', () =>
              compiler.compileCodeSplitReferenceRoute({
                code,
                analysis,
                filename,
                id: filename,
                addHmr: false,
                codeSplitGroupings,
                targetFramework: framework,
                sharedBindings: shared,
              }),
            )
            count('parses', mode === 'yuku-splitter' ? 0 : 1)
            if (reference) {
              consume(reference)
            } else {
              count('unchangedReferences')
            }
            for (const splitTargets of codeSplitGroupings) {
              consume(
                time('virtualCompile', () =>
                  compiler.compileCodeSplitVirtualRoute({
                    code,
                    analysis,
                    filename: `${filename}?tsr-split=${splitTargets.join('---')}`,
                    splitTargets,
                    sharedBindings: shared,
                  }),
                ),
              )
              count('parses', mode === 'yuku-splitter' ? 0 : 1)
            }
            if (shared) {
              consume(
                time('sharedCompile', () =>
                  compiler.compileCodeSplitSharedRoute({
                    code,
                    analysis,
                    filename: `${filename}?tsr-shared=1`,
                    sharedBindings,
                  }),
                ),
              )
              count('parses', mode === 'yuku-splitter' ? 0 : 1)
              count('sharedModules')
            }
          }
        }
      }
    }
  }
  for (let index = 0; index < warmups; index++) {
    execute()
  }
  global.gc()
  const before = process.memoryUsage()
  measuring = true
  const start = performance.now()
  for (let index = 0; index < iterations; index++) {
    execute()
  }
  const elapsedMs = performance.now() - start
  const after = process.memoryUsage()
  global.gc()
  const retained = process.memoryUsage()
  console.log(
    `BENCHMARK_JSON=${JSON.stringify({ mode, corpus, elapsedMs, phases, counts: Object.fromEntries(Object.entries(counts).map(([name, value]) => [name, value / iterations])), peakRssKiB: process.resourceUsage().maxRSS, before, after, retained, outputBytes, outputMapBytes, resolvedReferences, ...(outputDigest ? { outputDigest: outputDigest.digest('hex'), diagnosticOnly: true } : {}) })}`,
  )
}
