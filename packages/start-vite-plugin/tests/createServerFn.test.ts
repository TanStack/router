import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { compileAst } from '../src/ast'
import { createServerFnCompiler } from '../src/compilers'

async function getFilenames() {
  return await readdir(
    path.resolve(import.meta.dirname, './createServerFn/test-files'),
  )
}

describe('createServerFn compiles correctly', async () => {
  const filenames = await getFilenames()

  test.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(
        import.meta.dirname,
        `./createServerFn/test-files/${filename}`,
      ),
    )
    const code = file.toString()

    const result = await createServerFnCompiler({
      code,
      compile: compileAst({
        root: './createServerFn/test-files',
      }),
      filename,
    })

    await expect(result.code).toMatchFileSnapshot(
      `./createServerFn/snapshots/${filename}`,
    )
  })
})
