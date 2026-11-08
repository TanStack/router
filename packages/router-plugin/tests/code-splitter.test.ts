import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createIdentifier } from '@tanstack/router-utils'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { frameworks } from './constants'
import { formatSnapshot } from './format-snapshot'
import type { CodeSplitGroupings } from '../src/core/constants'

function getFrameworkDir(framework: string) {
  const files = path.resolve(
    __dirname,
    `./code-splitter/test-files/${framework}`,
  )
  const snapshots = path.resolve(
    __dirname,
    `./code-splitter/snapshots/${framework}`,
  )
  return { files, snapshots }
}

const testGroups: Array<{ name: string; groupings: CodeSplitGroupings }> = [
  {
    name: '1-default',
    groupings: defaultCodeSplitGroupings,
  },
  {
    name: '2-components-combined-loader-separate',
    groupings: [
      ['loader'],
      ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
  },
  {
    name: '3-all-combined-errorComponent-separate',
    groupings: [
      ['loader', 'component', 'pendingComponent', 'notFoundComponent'],
      ['errorComponent'],
    ],
  },
]

describe('code-splitter works', () => {
  describe.each(frameworks)('FRAMEWORK=%s', (framework) => {
    describe.each(testGroups)(
      'SPLIT_GROUP=$name',
      async ({ groupings: grouping, name: groupName }) => {
        const dirs = getFrameworkDir(framework)
        const filenames = await readdir(dirs.files)

        it.each(filenames)(
          `should compile "reference" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(dirs.files, filename))
            const code = file.toString()

            const sharedBindings = computeSharedBindings({
              code,
              codeSplitGroupings: grouping,
            })

            const compileResult = compileCodeSplitReferenceRoute({
              code,
              filename,
              id: filename,
              addHmr: false,
              codeSplitGroupings: grouping,
              targetFramework: framework,
              sharedBindings:
                sharedBindings.size > 0 ? sharedBindings : undefined,
            })

            await expect(
              await formatSnapshot(compileResult?.code || code, filename),
            ).toMatchFileSnapshot(
              path.join(dirs.snapshots, groupName, filename),
            )
          },
        )

        it.each(filenames)(
          `should compile "virtual" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(dirs.files, filename))
            const code = file.toString()

            const sharedBindings = computeSharedBindings({
              code,
              codeSplitGroupings: grouping,
            })

            for (const targets of grouping) {
              const ident = createIdentifier(targets)

              const splitResult = compileCodeSplitVirtualRoute({
                code,
                filename: `${filename}?${ident}`,
                splitTargets: targets,
                sharedBindings:
                  sharedBindings.size > 0 ? sharedBindings : undefined,
              })

              const snapshotFilename = path.join(
                dirs.snapshots,
                groupName,
                `${filename.replace('.tsx', '')}@${ident}.tsx`,
              )
              await expect(
                await formatSnapshot(splitResult.code, filename),
              ).toMatchFileSnapshot(snapshotFilename)
            }
          },
        )

        it.each(filenames)(
          `should compile "shared" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(dirs.files, filename))
            const code = file.toString()

            const sharedBindings = computeSharedBindings({
              code,
              codeSplitGroupings: grouping,
            })

            const snapshotFilename = path.join(
              dirs.snapshots,
              groupName,
              `${filename.replace('.tsx', '')}@shared.tsx`,
            )

            if (sharedBindings.size === 0) {
              // No shared module — snapshot should be empty string
              await expect('').toMatchFileSnapshot(snapshotFilename)
              return
            }

            const sharedResult = compileCodeSplitSharedRoute({
              code,
              sharedBindings,
              filename: `${filename}?tsr-shared=1`,
            })

            await expect(
              await formatSnapshot(sharedResult.code, filename),
            ).toMatchFileSnapshot(snapshotFilename)
          },
        )
      },
    )
  })
})

describe('React Refresh virtual route compiler plugin', () => {
  const splitComponentCases = [
    { splitType: 'component', splitIdentifier: 'SplitComponent' },
    {
      splitType: 'pendingComponent',
      splitIdentifier: 'SplitPendingComponent',
    },
    { splitType: 'errorComponent', splitIdentifier: 'SplitErrorComponent' },
  ] as const

  function createRouteCode(splitType: string) {
    return `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ ${splitType} })

function ${splitType}() {
  return <div>lowercase function declaration</div>
}
`
  }

  it.each(splitComponentCases)(
    'renames a lowercase $splitType binding when HMR is enabled',
    ({ splitType, splitIdentifier }) => {
      const result = compileCodeSplitVirtualRoute({
        code: createRouteCode(splitType),
        filename: `lowercase-function-declaration.tsx?tsr-split=${splitType}`,
        splitTargets: [splitType],
        compilerPlugins: getFrameworkHmrCompilerPlugins({
          targetFramework: 'react',
        }),
      })

      expect(result.code).toContain(`function ${splitIdentifier}()`)
      expect(result.code).toContain(
        `export { ${splitIdentifier} as ${splitType} }`,
      )
    },
  )

  it.each(splitComponentCases)(
    'keeps a lowercase $splitType binding when HMR is disabled',
    ({ splitType }) => {
      const result = compileCodeSplitVirtualRoute({
        code: createRouteCode(splitType),
        filename: `lowercase-function-declaration.tsx?tsr-split=${splitType}`,
        splitTargets: [splitType],
      })

      expect(result.code).toContain(`function ${splitType}()`)
      expect(result.code).toContain(`export { ${splitType} }`)
    },
  )
})
