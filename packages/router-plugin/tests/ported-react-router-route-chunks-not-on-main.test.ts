/**
 * Scenarios ported from React Router's route-chunk and export-removal tests
 * (remix-run/react-router `packages/react-router-dev/vite/route-chunks-test.ts`
 * and `remove-exports-test.ts`, MIT) that the Babel-based code splitter on
 * `main` gets wrong and the Yuku-based compiler handles. Split route options
 * play the chunked exports and the reference module plays the main chunk.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'
import { getModuleErrors } from './validate-module'
import type { CodeSplitGroupings } from '../src/core/constants'

const filename = 'route.tsx'
const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const runNode = promisify(execFile)

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings: [...sharedBindings].sort() }
}

async function getErrorsByModule(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  return errors
}

function noErrors(modules: Record<string, string>) {
  return Object.fromEntries(Object.keys(modules).map((name) => [name, []]))
}

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  groupings: CodeSplitGroupings
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.ported-react-router-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    for (const [file, code] of Object.entries(options.files)) {
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
            defaultBehavior: options.groupings,
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
const result = await (async () => { ${options.script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

describe('ported React Router route chunks: export dependency analysis', () => {
  // Source: route-chunks-test.ts "reassignment with nullish coalescing" and
  // "destructured reassignment"
  it('keeps top-level reassignments of a binding the split component reads', async () => {
    const result = await buildAndRun({
      groupings: defaultCodeSplitGroupings,
      files: {
        'routes/index.tsx': `${head}let plain = 'initial'
plain = 'assigned'
let compound = 1
compound += 1
let logical = ''
logical ||= 'logical'
let handler: (() => string) | undefined
handler ??= () => 'handler'
let swapped = () => 'original'
;[swapped] = [() => 'swapped']
export const Route = createFileRoute('/')({
  component: () => <p>{[plain, compound, logical, handler!(), swapped()].join(' ')}</p>,
})`,
        'entry.ts': renderEntry,
      },
      script: `return await entry.render(entry.Route.options.component)`,
    })
    expect(result).toBe('<p>assigned 2 logical handler swapped</p>')
  }, 30_000)

  // Source: route-chunks-test.ts "isolated exported destructured array
  // variable declarations sharing an export statement" and "exported
  // destructured array variable declarations sharing an assignment"
  it.each([
    {
      name: 'its own array destructuring',
      code: `import { chunkMessage, mainMessage } from './messages'
const [Page] = [() => <div>{chunkMessage}</div>],
  [main] = [mainMessage]
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})`,
    },
    {
      name: 'an array destructuring shared with the loader',
      code: `import { chunkMessage, mainMessage } from './messages'
const [Page, main] = [() => <div>{chunkMessage}</div>, mainMessage]
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})`,
    },
    {
      name: 'an array destructuring shared with the errorComponent',
      code: `import { createPair } from './factory'
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})`,
    },
  ])('splits a component declared by $name', async ({ code }) => {
    const { modules } = compileRouteModules(`${head}${code}\n`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules['virtual component']).toMatch(
      /export \{ \w+ as component \}/,
    )
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })

  // Source: route-chunks-test.ts "functions referencing their own identifiers"
  // (a TypeScript namespace instead of a namespace import)
  it.each([
    { name: 'the component', loader: `'data'` },
    { name: 'the loader and the component', loader: `Format.id('loader')` },
  ])(
    'emits valid modules for a TypeScript namespace used by $name',
    async ({ loader }) => {
      const { modules } = compileRouteModules(`${head}namespace Format {
  export const prefix = '#'
  export function id(value: string) {
    return prefix + value
  }
}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>{Format.id('component')}</div>,
})
`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    },
  )

  // Source: route-chunks-test.ts "chunkable" detection of export values
  it.each([
    {
      name: 'a satisfies expression',
      code: `import type { FC } from 'react'
function Page() {
  return <div>page</div>
}
export const Route = createFileRoute('/')({ component: Page satisfies FC })`,
    },
    {
      name: 'a non-null assertion',
      code: `const Page: (() => any) | undefined = () => <div>page</div>
export const Route = createFileRoute('/')({ component: Page! })`,
    },
  ])('splits a component wrapped in $name', async ({ code }) => {
    const { modules } = compileRouteModules(`${head}${code}\n`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules['virtual component']).toContain('<div>page</div>')
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
  })
})

describe('ported React Router export removal', () => {
  // Source: remove-exports-test.ts "function statement with property
  // assignment"
  it('renders a split component that has properties assigned at the top level', async () => {
    const result = await buildAndRun({
      groupings: defaultCodeSplitGroupings,
      files: {
        'routes/index.tsx': `${head}function Page() {
  return <p>{(Page as any).label}</p>
}
;(Page as any).label = 'page'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})`,
        'entry.ts': renderEntry,
      },
      script: `return await entry.render(entry.Route.options.component)`,
    })
    expect(result).toBe('<p>page</p>')
  }, 30_000)
})
