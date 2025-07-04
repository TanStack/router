import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import type { Config, DeletableNodes } from '../src/core/config'

function getFrameworkDir(framework: string) {
  const files = path.resolve(
    __dirname,
    `./delete-nodes/test-files/${framework}`,
  )
  const snapshots = path.resolve(
    __dirname,
    `./delete-nodes/snapshots/${framework}`,
  )
  return { files, snapshots }
}

const testGroups: Array<{
  name: string
  deleteNodes: DeletableNodes | undefined
}> = [
  {
    deleteNodes: undefined,
    name: '1-delete-nodes-undefined',
  },
  { deleteNodes: [], name: '2-delete-nodes-empty' },
  {
    deleteNodes: ['ssr'],
    name: '3-delete-nodes-ssr',
  },
]

const frameworks: Array<Config['target']> = ['react', 'solid']

describe('code-splitter delete nodes', () => {
  describe.each(frameworks)('FRAMEWORK=%s', (framework) => {
    describe.each(testGroups)(
      'SPLIT_GROUP=$name',
      async ({ deleteNodes, name: groupName }) => {
        const dirs = getFrameworkDir(framework)
        const filenames = await readdir(dirs.files)

        describe.each(['development', 'production'])(
          'NODE_ENV=%s ',
          (NODE_ENV) => {
            process.env.NODE_ENV = NODE_ENV

            it.each(filenames)(
              `should compile "reference" for "%s"`,
              async (filename) => {
                const file = await readFile(path.join(dirs.files, filename))
                const code = file.toString()

                const compileResult = compileCodeSplitReferenceRoute({
                  code,
                  filename,
                  id: filename,
                  runtimeEnv: NODE_ENV === 'production' ? 'prod' : 'dev',
                  codeSplitGroupings: [],
                  deleteNodes,
                  targetFramework: framework,
                })

                await expect(compileResult.code).toMatchFileSnapshot(
                  path.join(dirs.snapshots, groupName, NODE_ENV, filename),
                )
              },
            )
          },
        )
      },
    )
  })
})
