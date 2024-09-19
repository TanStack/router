import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { splitToken } from '../src/core/constants'

async function getFilenames() {
  return await readdir(path.resolve(__dirname, './code-splitter/test-files'))
}

describe('code-splitter works', async () => {
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
        `./code-splitter/snapshots/${filename}`,
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
        filename: `${filename}?${splitToken}`,
      })

      await expect(splitResult.code).toMatchFileSnapshot(
        `./code-splitter/snapshots/${filename.replace('.tsx', '')}@split.tsx`,
      )
    },
  )
})
