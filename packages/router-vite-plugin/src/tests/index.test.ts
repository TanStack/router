import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { expect, test } from 'vitest'
import { compileFile, makeCompile, splitFile } from '../compilers'
import { splitPrefix } from '../constants'

test('it compiles and splits', async () => {
  // get the list of files from the /test-files directory
  const files = await readdir(path.resolve(__dirname, './test-files'))
  for (const file of files) {
    console.log('Testing:', file)
    await compileTestFile({ file })
    await splitTestFile({ file })
  }
})

async function compileTestFile(opts: { file: string }) {
  const code = (
    await readFile(path.resolve(__dirname, `./test-files/${opts.file}`))
  ).toString()

  // console.log('Compiling...')
  // console.log('⬇️⬇️⬇️⬇️⬇️')
  // console.log()
  const result = await compileFile({
    code,
    compile: makeCompile({
      root: path.resolve(__dirname, './test-files'),
    }),
    filename: `${opts.file}`,
  })

  // console.log(result.code)
  // console.log()

  await expect(result.code).toMatchFileSnapshot(`./snapshots/${opts.file}`)
}

async function splitTestFile(opts: { file: string }) {
  const code = (
    await readFile(path.resolve(__dirname, `./test-files/${opts.file}`))
  ).toString()

  // console.log('Splitting...')
  // console.log('⬇️⬇️⬇️⬇️⬇️')
  // console.log()
  const result = await splitFile({
    code,
    compile: makeCompile({
      root: path.resolve(__dirname, './test-files'),
    }),
    filename: `${opts.file}?${splitPrefix}`,
  })

  // console.log(result.code)
  // console.log()
  await expect(result.code).toMatchFileSnapshot(
    `./snapshots/${opts.file.replace('.tsx', '')}?split.tsx`,
  )
}
