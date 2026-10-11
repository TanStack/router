import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import type { CodeSplittingOptions } from '@tanstack/router-plugin'

type CodeSplitGroupings = NonNullable<CodeSplittingOptions['defaultBehavior']>

const runNode = promisify(execFile)

/**
 * Builds a small app with the real Vite plugin (code splitting on, default
 * groupings unless `groupings` is given): `routes/index.tsx` holds `route`,
 * and `entry.ts` re-exports the route module next to `render(component)`,
 * which preloads a component and renders it to a string. `files` adds files
 * or replaces `entry.ts`. Then imports the built entry in a separate Node
 * process and returns the JSON value returned by `script`, which has the
 * entry's exports in scope as `entry`.
 */
export async function buildAndRun(
  route: string,
  script: string,
  options: {
    files?: Record<string, string>
    groupings?: CodeSplitGroupings
  } = {},
) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.regression-build-'))
  try {
    await mkdir(path.join(root, 'routes'))
    const files: Record<string, string> = {
      'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      'routes/index.tsx': route,
      'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
      ...options.files,
    }
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            ...(options.groupings && { defaultBehavior: options.groupings }),
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
