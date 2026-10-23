import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRsbuild, loadConfig, mergeRsbuildConfig } from '@rsbuild/core'
import { createHmrFileEditor } from '@tanstack/router-e2e-utils'
import { expect, test } from '@playwright/test'
import type { RsbuildPlugin } from '@rsbuild/core'

const fixtureRoot = path.resolve(import.meta.dirname, '..')
const sourceDir = path.join(fixtureRoot, 'src/import-protection-hmr')
const targetFile = path.join(sourceDir, 'target.ts')
const markedFile = path.join(sourceDir, 'marked.ts')
const perfFile = path.join(
  tmpdir(),
  `tss-import-protection-hmr-${process.pid}.json`,
)

const target = (label: string, imports = '') => `${imports}
import { marked } from './marked'

export const label = () => \`${label} \${marked()}\`
`

test('checks rebuilt modules and their importers during development rebuilds', async () => {
  test.setTimeout(120_000)
  const editor = createHmrFileEditor({
    rootDir: fixtureRoot,
    files: { index: 'src/routes/index.tsx' },
  })
  await editor.capturePromise
  const previousPerf = process.env.TSR_IMPORT_PROTECTION_PERF
  const previousPerfFile = process.env.TSR_IMPORT_PROTECTION_PERF_FILE
  const clientWarnings: Array<string> = []
  let compileWaiters: Array<() => void> = []
  const nextCompile = () =>
    new Promise<void>((resolve) => {
      compileWaiters.push(resolve)
    })
  const editAndCompile = async (file: string, source: string) => {
    const compiled = nextCompile()
    await writeFile(file, source)
    await compiled
  }
  const readIncrementalModules = async () =>
    (
      JSON.parse(await readFile(perfFile, 'utf8')) as {
        counters: Record<string, number | undefined>
      }
    ).counters['processAssets.incremental.modules'] ?? 0

  await mkdir(sourceDir, { recursive: true })
  await writeFile(targetFile, target('safe'))
  await writeFile(markedFile, `export const marked = () => 'plain'\n`)
  await writeFile(
    path.join(sourceDir, 'secret.server.ts'),
    `export const secret = () => 'secret'\n`,
  )
  await editor.replaceText(
    'index',
    `import { createFileRoute } from '@tanstack/react-router'`,
    `import { createFileRoute } from '@tanstack/react-router'
import { label } from '../import-protection-hmr/target'`,
  )
  await editor.replaceText(
    'index',
    '<p>Error overlay fixture</p>',
    '<p>Error overlay fixture</p>\n      <p>{label()}</p>',
  )
  process.env.TSR_IMPORT_PROTECTION_PERF = '1'
  process.env.TSR_IMPORT_PROTECTION_PERF_FILE = perfFile

  try {
    const { content } = await loadConfig({ cwd: fixtureRoot })
    const rsbuild = await createRsbuild({
      cwd: fixtureRoot,
      rsbuildConfig: mergeRsbuildConfig(content, {
        root: fixtureRoot,
        plugins: [
          {
            name: 'observe-import-protection-rebuilds',
            setup(api) {
              api.onAfterEnvironmentCompile(({ environment, stats }) => {
                if (environment.name === 'client' && stats) {
                  for (const warning of stats.compilation.warnings) {
                    clientWarnings.push(warning.message)
                  }
                }
              })
              api.onAfterDevCompile(() => {
                const waiters = compileWaiters
                compileWaiters = []
                for (const resolve of waiters) {
                  resolve()
                }
              })
            },
          } satisfies RsbuildPlugin,
        ],
      }),
    })
    const initialCompile = nextCompile()
    const server = await rsbuild.createDevServer({ getPortSilently: true })
    try {
      await initialCompile
      expect(clientWarnings.join('\n')).not.toContain('import-protection-hmr')

      await editAndCompile(targetFile, target('edited'))
      expect(clientWarnings.join('\n')).not.toContain('import-protection-hmr')
      expect(await readIncrementalModules()).toBeGreaterThan(0)

      await editAndCompile(
        targetFile,
        target(
          'secret',
          `import { secret } from './secret.server'\nexport const leak = () => secret()\n`,
        ),
      )
      expect(clientWarnings.join('\n')).toContain('secret.server')

      await editAndCompile(targetFile, target('restored'))
      await editAndCompile(
        markedFile,
        `import '@tanstack/react-start/server-only'\n\nexport const marked = () => 'server'\n`,
      )
      expect(
        clientWarnings.some(
          (warning) =>
            warning.includes('marked') &&
            warning.includes('@tanstack/react-start/server-only'),
        ),
      ).toBe(true)
    } finally {
      await server.close()
    }
  } finally {
    restoreEnv('TSR_IMPORT_PROTECTION_PERF', previousPerf)
    restoreEnv('TSR_IMPORT_PROTECTION_PERF_FILE', previousPerfFile)
    await editor.restoreFiles()
    await rm(sourceDir, { recursive: true, force: true })
    await rm(perfFile, { force: true })
  }
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
