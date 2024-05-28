import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { expect, test } from 'vitest'
import { compileFile, makeCompile } from '../src/compilers'

test('it adds use server directive', async () => {
  // get the list of files from the /test-files directory
  const files = await readdir(path.resolve(__dirname, './test-files'))
  for (const file of files) {
    console.log('Testing:', file)
    await compileTestFile({ file })
  }
})

async function compileTestFile(opts: { file: string }) {
  const code = (
    await readFile(path.resolve(__dirname, `./test-files/${opts.file}`))
  ).toString()

  const filename = opts.file.replace(__dirname, '')

  // console.log('Compiling...')
  // console.log('⬇️⬇️⬇️⬇️⬇️')
  // console.log()
  const result = await compileFile({
    code,
    compile: makeCompile({
      root: './test-files',
    }),
    filename,
  })

  // console.log(result.code)
  // console.log()

  await expect(result.code).toMatchFileSnapshot(`./snapshots/${filename}`)
}
