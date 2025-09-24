import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { createIdentifier } from '../src/core/code-splitter/path-ids'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { frameworks } from './constants'
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

            const compileResult = compileCodeSplitReferenceRoute({
              code,
              filename,
              id: filename,
              addHmr: false,
              codeSplitGroupings: grouping,
              targetFramework: framework,
            })

            await expect(compileResult.code).toMatchFileSnapshot(
              path.join(dirs.snapshots, groupName, filename),
            )
          },
        )

        it.each(filenames)(
          `should compile "virtual" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(dirs.files, filename))
            const code = file.toString()

            for (const targets of grouping) {
              const ident = createIdentifier(targets)

              const splitResult = compileCodeSplitVirtualRoute({
                code,
                filename: `${filename}?${ident}`,
                splitTargets: targets,
              })

              const snapshotFilename = path.join(
                dirs.snapshots,
                groupName,
                `${filename.replace('.tsx', '')}@${ident}.tsx`,
              )
              await expect(splitResult.code).toMatchFileSnapshot(
                snapshotFilename,
              )
            }
          },
        )
      },
    )
  })
})
