import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { compileAst } from '../src/ast'
import { compileFile, splitFile } from '../src/compilers'
import { splitPrefix } from '../src/constants'

async function getFilenames() {
  return await readdir(path.resolve(__dirname, './code-splitter/test-files'))
}

describe('code-splitter works', async () => {
  const filenames = await getFilenames()

  it.each(filenames)(
    'should handle the compiling and splitting of "%s"',
    async (filename) => {
      const file = await readFile(
        path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
      )
      const code = file.toString()

      const compilerResult = await compileFile({
        code,
        compileAst: compileAst({
          root: './code-splitter/test-files',
        }),
        filename,
      })

      await expect(compilerResult.code).toMatchFileSnapshot(
        `./code-splitter/snapshots/${filename}`,
      )

      const splitResult = await splitFile({
        code,
        compileAst: compileAst({
          root: './code-splitter/test-files',
        }),
        filename: `${filename}?${splitPrefix}`,
      })

      await expect(splitResult.code).toMatchFileSnapshot(
        `./code-splitter/snapshots/${filename.replace('.tsx', '')}@split.tsx`,
      )
    },
  )
})
