import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { splitPrefix } from '../src/core/constants'

async function getFilenames() {
  return await readdir(path.resolve(__dirname, './code-splitter/test-files'))
}

describe.each(['development', 'production'])(
  'code-splitter works, NODE_ENV=%s ',
  async (NODE_ENV) => {
    process.env.NODE_ENV = NODE_ENV
    const filenames = await getFilenames()

    it.each(filenames)(
      'should handle the compiling of "%s"',
      async (filename) => {
        const file = await readFile(
          path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
        )
        const code = file.toString()

        const compileResult = compileCodeSplitReferenceRoute({
          code,
          root: './code-splitter/test-files',
          filename,
        })

        await expect(compileResult.code).toMatchFileSnapshot(
          `./code-splitter/snapshots/${NODE_ENV}/${filename}`,
        )
      },
    )

    it.each(filenames)(
      'should handle the splitting of "%s"',
      async (filename) => {
        const file = await readFile(
          path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
        )
        const code = file.toString()

        const splitResult = compileCodeSplitVirtualRoute({
          code: code,
          root: './code-splitter/test-files',
          filename: `${filename}?${splitPrefix}`,
        })

        await expect(splitResult.code).toMatchFileSnapshot(
          `./code-splitter/snapshots/${NODE_ENV}/${filename.replace('.tsx', '')}@split.tsx`,
        )
      },
    )
  },
)
