import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { createIdentifier } from '../src/core/code-splitter/path-ids'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import type { CodeSplitGroupings } from '../src/core/constants'

async function getFilenames() {
  return await readdir(path.resolve(__dirname, './code-splitter/test-files'))
}

const testGroups = [
  {
    name: '1-default',
    groupings: defaultCodeSplitGroupings,
  },
  {
    name: '2-separated',
    groupings: [['loader'], ['component']],
  },
  {
    name: '3-mixed',
    groupings: [['loader', 'component']],
  },
] as Array<{ name: string; groupings: CodeSplitGroupings }>

describe('code-splitter works', () => {
  describe.each(testGroups)(
    'SPLIT_GROUP=$name',
    async ({ groupings: grouping, name: groupName }) => {
      const filenames = await getFilenames()

      describe.each(['development', 'production'])(
        'NODE_ENV=%s ',
        (NODE_ENV) => {
          process.env.NODE_ENV = NODE_ENV

          it.each(filenames)(
            `should compile "reference" for "%s"`,
            async (filename) => {
              const file = await readFile(
                path.resolve(
                  __dirname,
                  `./code-splitter/test-files/${filename}`,
                ),
              )
              const code = file.toString()

              const compileResult = compileCodeSplitReferenceRoute({
                code,
                root: './code-splitter/test-files',
                filename,
                runtimeEnv: NODE_ENV === 'production' ? 'prod' : 'dev',
                codeSplitGroupings: grouping,
              })

              await expect(compileResult.code).toMatchFileSnapshot(
                `./code-splitter/snapshots/${groupName}/${NODE_ENV}/${filename}`,
              )
            },
          )

          it.each(filenames)(
            `should compile "virtual" for "%s"`,
            async (filename) => {
              const file = await readFile(
                path.resolve(
                  __dirname,
                  `./code-splitter/test-files/${filename}`,
                ),
              )
              const code = file.toString()

              for (const targets of grouping) {
                const ident = createIdentifier(targets)

                const splitResult = compileCodeSplitVirtualRoute({
                  code,
                  root: './code-splitter/test-files',
                  filename: `${filename}?${ident}`,
                  splitTargets: targets,
                })

                await expect(splitResult.code).toMatchFileSnapshot(
                  `./code-splitter/snapshots/${groupName}/${NODE_ENV}/${filename.replace(
                    '.tsx',
                    '',
                  )}@${ident}.tsx`,
                )
              }
            },
          )
        },
      )
    },
  )
})

// it.each(filenames)(
//   'should handle the "reference" compiling of "%s"',
//   async (filename) => {
//     const file = await readFile(
//       path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
//     )
//     const code = file.toString()

//     const compileResult = compileCodeSplitReferenceRoute({
//       code,
//       root: './code-splitter/test-files',
//       filename,
//       isProduction: NODE_ENV === 'production',
//     })

//     await expect(compileResult.code).toMatchFileSnapshot(
//       `./code-splitter/snapshots/${NODE_ENV}/${filename}`,
//     )
//   },
// )

// it.each(filenames)(
//   'should handle the "component" splitting of "%s"',
//   async (filename) => {
//     const file = await readFile(
//       path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
//     )
//     const code = file.toString()

//     const splitResult = compileCodeSplitVirtualRoute({
//       code: code,
//       root: './code-splitter/test-files',
//       filename: `${filename}?${splitPrefixes.ROUTE_COMPONENT}`,
//       splitTargets: ['component'],
//     })

//     await expect(splitResult.code).toMatchFileSnapshot(
//       `./code-splitter/snapshots/${NODE_ENV}/${filename.replace('.tsx', '')}@component.tsx`,
//     )
//   },
// )

// it.each(filenames)(
//   'should handle the "loader" splitting of "%s"',
//   async (filename) => {
//     const file = await readFile(
//       path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
//     )
//     const code = file.toString()

//     const splitResult = compileCodeSplitVirtualRoute({
//       code: code,
//       root: './code-splitter/test-files',
//       filename: `${filename}?${splitPrefixes.ROUTE_LOADER}`,
//       splitTargets: ['loader'],
//     })

//     await expect(splitResult.code).toMatchFileSnapshot(
//       `./code-splitter/snapshots/${NODE_ENV}/${filename.replace('.tsx', '')}@loader.tsx`,
//     )
//   },
// )
