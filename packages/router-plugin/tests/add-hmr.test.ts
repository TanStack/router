import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getReferenceRouteCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { frameworks } from './constants'

function getFrameworkDir(framework: string) {
  const files = path.resolve(__dirname, `./add-hmr/test-files/${framework}`)
  const snapshots = path.resolve(__dirname, `./add-hmr/snapshots/${framework}`)
  return { files, snapshots }
}

describe('add-hmr works', () => {
  describe.each(frameworks)('FRAMEWORK=%s', async (framework) => {
    const dirs = getFrameworkDir(framework)
    const filenames = await readdir(dirs.files)

    it.each(filenames)(
      `should add hmr in "reference" for "%s"`,
      async (filename) => {
        const file = await readFile(path.join(dirs.files, filename))
        const code = file.toString()

        const compileResult = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          addHmr: true,
          codeSplitGroupings: defaultCodeSplitGroupings,
          targetFramework: framework,
          compilerPlugins: getReferenceRouteCompilerPlugins({
            targetFramework: framework,
            addHmr: true,
          }),
        })

        await expect(compileResult?.code || code).toMatchFileSnapshot(
          path.join(dirs.snapshots, filename.replace('.tsx', '@true.tsx')),
        )
      },
    )

    it.each(filenames)(
      `should NOT add hmr in "reference" for "%s"`,
      async (filename) => {
        const file = await readFile(path.join(dirs.files, filename))
        const code = file.toString()

        const compileResult = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          addHmr: false,
          codeSplitGroupings: defaultCodeSplitGroupings,
          targetFramework: framework,
          compilerPlugins: getReferenceRouteCompilerPlugins({
            targetFramework: framework,
            addHmr: false,
          }),
        })

        await expect(compileResult?.code || code).toMatchFileSnapshot(
          path.join(dirs.snapshots, filename.replace('.tsx', '@false.tsx')),
        )
      },
    )
  })

  it('initializes import.meta.hot.data before storing stable split components', () => {
    const code = `
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: component,
})

function component() {
  return <div>posts</div>
}
`

    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename: 'posts.tsx',
      id: 'posts.tsx',
      addHmr: true,
      codeSplitGroupings: defaultCodeSplitGroupings,
      targetFramework: 'react',
      compilerPlugins: getReferenceRouteCompilerPlugins({
        targetFramework: 'react',
        addHmr: true,
      }),
    })

    expect(compileResult?.code).toContain('import.meta.hot.data ??= {}')
    expect(compileResult?.code).toContain(
      'import.meta.hot.data["tsr-split-component:component"] = TSRSplitComponent',
    )
  })
})
