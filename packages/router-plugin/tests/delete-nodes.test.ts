import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import * as t from '@babel/types'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { frameworks } from './constants'
import type { DeleteNodeCallback, DeletableNodes } from '../src/core/config'

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
  it('deletes nested route option properties by dot path', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { serverOnly } from './server-only'
import { clientOnly } from './client-only'

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate({ data }) {
      return serverOnly(data)
    },
    hydrate: ({ data }) => clientOnly(data),
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: ({ data }) => serverOnly(data),
    hydrate: ({ data }) => clientOnly(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => serverOnly(data),
    hydrate: ({ data }) => clientOnly(data),
  },
  component: () => <div className="p-2">hello world</div>,
})
`

    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename: 'route-lifecycle-object.tsx',
      id: 'route-lifecycle-object.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set([
        'context.dehydrate',
        'beforeLoad.dehydrate',
        'loader.dehydrate',
      ]),
      targetFramework: 'react',
    })

    const output = compileResult?.code || code

    expect(output).not.toMatch(/\bdehydrate\b/)
    expect(output).not.toMatch(/\bserverOnly\b/)
    expect(output).toMatch(/\bhydrate\b/)
    expect(output).toMatch(/\bclientOnly\b/)
  })

  it('can delete the opposite nested route option properties', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { serverOnly } from './server-only'
import { clientOnly } from './client-only'

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => serverOnly(data),
    revalidate({ prev }) {
      return clientOnly(prev)
    },
    hydrate({ data }) {
      return clientOnly(data)
    },
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: ({ data }) => serverOnly(data),
    hydrate: ({ data }) => clientOnly(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => serverOnly(data),
    hydrate: ({ data }) => clientOnly(data),
  },
  component: () => <div className="p-2">hello world</div>,
})
`

    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename: 'route-lifecycle-object.tsx',
      id: 'route-lifecycle-object.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set([
        'context.revalidate',
        'context.hydrate',
        'beforeLoad.hydrate',
        'loader.hydrate',
      ]),
      targetFramework: 'react',
    })

    const output = compileResult?.code || code

    expect(output).toMatch(/\bdehydrate\b/)
    expect(output).toMatch(/\bserverOnly\b/)
    expect(output).not.toMatch(/\brevalidate\b/)
    expect(output).not.toMatch(/\bhydrate\b/)
    expect(output).not.toMatch(/\bclientOnly\b/)
  })

  it('can apply delete node callbacks to route option properties', () => {
    const replaceCustomDehydrateWithTrue: DeleteNodeCallback = ({
      dotPath,
      prop,
      key,
    }) => {
      if (!dotPath.endsWith('.dehydrate')) {
        return
      }

      if (t.isObjectProperty(prop) && t.isBooleanLiteral(prop.value)) {
        return
      }

      return {
        action: 'replace',
        node: t.objectProperty(t.identifier(key), t.booleanLiteral(true)),
      }
    }

    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { serverOnly } from './server-only'
import { clientOnly } from './client-only'

export const Route = createFileRoute('/')({
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: true,
    hydrate: ({ data }) => clientOnly(data),
  },
  beforeLoad: {
    handler: () => ({ value: 'beforeLoad' }),
    dehydrate: false,
    hydrate: ({ data }) => clientOnly(data),
  },
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate({ data }) {
      return serverOnly(data)
    },
    hydrate: ({ data }) => clientOnly(data),
  },
})
`

    const compileResult = compileCodeSplitReferenceRoute({
      code,
      filename: 'route-lifecycle-object.tsx',
      id: 'route-lifecycle-object.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      deleteNodes: new Set([
        replaceCustomDehydrateWithTrue,
        'context.hydrate',
        'beforeLoad.hydrate',
        'loader.hydrate',
      ]),
      targetFramework: 'react',
    })

    const output = compileResult?.code || code

    expect(output).toMatch(/dehydrate:\s*true/)
    expect(output).toMatch(/dehydrate:\s*false/)
    expect(output).not.toMatch(/\bserverOnly\b/)
    expect(output).not.toMatch(/\bhydrate\b/)
    expect(output).not.toMatch(/\bclientOnly\b/)
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
