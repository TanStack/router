import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { frameworks } from './constants'
import type { DeletableNodes } from '../src/core/config'

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
  deleteNodes: Array<DeletableNodes> | undefined
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

describe('code-splitter delete nodes', () => {
  it('should delete route options declared as object methods', () => {
    const compileResult = compileCodeSplitReferenceRoute({
      code: `
import { createFileRoute } from '@tanstack/react-router'
import crypto from 'node:crypto'

export const Route = createFileRoute('/')({
  ssr() {
    return crypto.randomInt(0, 2) === 0
  },
  component: () => <div>hello world</div>,
})
`,
      filename: 'ssr-method.tsx',
      id: 'ssr-method.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set(['ssr']),
      targetFramework: 'react',
    })

    expect(compileResult?.code).not.toContain('ssr()')
    expect(compileResult?.code).not.toContain('node:crypto')
  })

  it('should strip prerenderParams and its server-only imports', () => {
    const compileResult = compileCodeSplitReferenceRoute({
      code: `
import { createFileRoute } from '@tanstack/react-router'
import { readdir } from 'node:fs/promises'

export const Route = createFileRoute('/posts/$slug')({
  prerenderParams: async () => {
    const entries = await readdir('content/posts')
    return entries.map((slug) => ({ params: { slug } }))
  },
  component: () => <div>post</div>,
})
`,
      filename: 'posts.$slug.tsx',
      id: 'posts.$slug.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set(['prerenderParams', 'sitemap']),
      targetFramework: 'react',
    })

    expect(compileResult?.code).not.toContain('prerenderParams')
    expect(compileResult?.code).not.toContain('readdir')
    expect(compileResult?.code).not.toContain('node:fs/promises')
    expect(compileResult?.code).not.toContain('content/posts')
  })

  it('should strip sitemap and its server-only imports', () => {
    const compileResult = compileCodeSplitReferenceRoute({
      code: `
import { createFileRoute } from '@tanstack/react-router'
import { computePriority } from './sitemap-priority.server'

export const Route = createFileRoute('/about')({
  sitemap: {
    priority: computePriority(),
    changefreq: 'weekly',
  },
  component: () => <div>about</div>,
})
`,
      filename: 'about.tsx',
      id: 'about.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set(['prerenderParams', 'sitemap']),
      targetFramework: 'react',
    })

    expect(compileResult?.code).not.toContain('sitemap')
    expect(compileResult?.code).not.toContain('computePriority')
    expect(compileResult?.code).not.toContain('sitemap-priority.server')
    expect(compileResult?.code).not.toContain('weekly')
  })

  describe.each(frameworks)('FRAMEWORK=%s', (framework) => {
    describe.each(testGroups)(
      'SPLIT_GROUP=$name',
      async ({ deleteNodes, name: groupName }) => {
        const dirs = getFrameworkDir(framework)
        const filenames = await readdir(dirs.files)

        it.each(filenames)(
          `should compile "reference" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(dirs.files, filename))
            const code = file.toString()

            const compileResult = compileCodeSplitReferenceRoute({
              code,
              filename,
              id: filename,
              addHmr: false,
              codeSplitGroupings: [],
              deleteNodes: new Set(deleteNodes),
              targetFramework: framework,
            })

            await expect(compileResult?.code || code).toMatchFileSnapshot(
              path.join(dirs.snapshots, groupName, filename),
            )
          },
        )
      },
    )
  })
})
