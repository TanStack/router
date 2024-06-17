import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { compileAst } from '../src/ast'
import { createServerFnCompiler } from '../src/compilers'

describe('createServerFn', () => {
  test('adds the "user server" directive', async () => {
    // get the list of files from the /test-files directory
    const file = await readFile(
      path.resolve(__dirname, './test-files/createServerFn.tsx'),
    )
    const code = file.toString()

    const result = await createServerFnCompiler({
      code,
      compile: compileAst({
        root: './test-files',
      }),
      filename: 'createServerFn.tsx',
    })

    await expect(result.code).toMatchFileSnapshot(
      './snapshots/createServerFn.tsx',
    )
  })
})
