import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { frameworks } from './constants'
import { formatSnapshot } from './format-snapshot'
import {
  createCodeSplitterTransforms,
  importSources,
  routeFile,
} from './regression-helpers'
import type { Config, DeletableNodes } from '../src/core/config'

type DeleteNodesGroup = {
  name: string
  deleteNodes: Array<DeletableNodes> | undefined
}

const testGroups: Array<DeleteNodesGroup> = [
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

/**
 * The lists Start passes for its client and server builds: the client never
 * reads `dehydrate` (it restores by wire presence), the server never runs
 * `hydrate` or `context.revalidate`.
 */
const lifecycleGroups: Array<DeleteNodesGroup> = [
  {
    name: 'client',
    deleteNodes: [
      'ssr',
      'server',
      'headers',
      'context.dehydrate',
      'beforeLoad.dehydrate',
      'loader.dehydrate',
    ],
  },
  {
    name: 'server',
    deleteNodes: [
      'context.hydrate',
      'beforeLoad.hydrate',
      'loader.hydrate',
      'context.revalidate',
    ],
  },
]

function compile(
  code: string,
  deleteNodes: Array<DeletableNodes> | undefined,
  options: { framework?: Config['target']; filename?: string } = {},
) {
  const { framework = 'react', filename = 'route.tsx' } = options
  return compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: [],
    deleteNodes: new Set(deleteNodes),
    targetFramework: framework,
  })
}

/**
 * Compiles every file under `delete-nodes/<suite>test-files/<framework>` with
 * each group's list and compares it with the file snapshot under
 * `delete-nodes/<suite>snapshots/<framework>/<group>`.
 */
function describeSnapshots(suite: string, groups: Array<DeleteNodesGroup>) {
  describe.each(frameworks)('FRAMEWORK=%s', (framework) => {
    describe.each(groups)(
      'SPLIT_GROUP=$name',
      async ({ deleteNodes, name: groupName }) => {
        const files = path.resolve(
          __dirname,
          `./delete-nodes/${suite}test-files/${framework}`,
        )
        const snapshots = path.resolve(
          __dirname,
          `./delete-nodes/${suite}snapshots/${framework}`,
        )
        const filenames = await readdir(files)

        it.each(filenames)(
          `should compile "reference" for "%s"`,
          async (filename) => {
            const file = await readFile(path.join(files, filename))
            const code = file.toString()

            const compileResult = compile(code, deleteNodes, {
              framework,
              filename,
            })

            await expect(
              await formatSnapshot(compileResult?.code || code, filename),
            ).toMatchFileSnapshot(path.join(snapshots, groupName, filename))
          },
        )
      },
    )
  })
}

describe('code-splitter delete nodes', () => {
  describeSnapshots('', testGroups)
})

describe('code-splitter delete nodes: dot paths into object-form lifecycles', () => {
  describeSnapshots('lifecycle/', lifecycleGroups)

  const codecRoute = `
import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import { fetchPost } from './posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: {
    handler: ({ params }) => fetchPost(params.postId),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
})
`

  it('removes an import only used inside a deleted dehydrate from the client output and keeps it in the server output', () => {
    const client = compile(codecRoute, ['loader.dehydrate'])!.code
    const server = compile(codecRoute, ['loader.hydrate'])!.code

    expect(client).not.toMatch(/\bdehydrate\b/)
    expect(client).toMatch(/\bhydrate\b/)
    expect(importSources(client)).toEqual([
      './client-only',
      './posts',
      '@tanstack/react-router',
    ])

    expect(server).toMatch(/\bdehydrate\b/)
    expect(server).not.toMatch(/\bhydrate\b/)
    expect(importSources(server)).toEqual([
      './posts',
      './server-only',
      '@tanstack/react-router',
    ])
  })

  it('reaches the compiler through the code-splitter plugin', async () => {
    const file = routeFile('posts')
    const splitter = await createCodeSplitterTransforms(
      {
        codeSplittingOptions: {
          deleteNodes: ['loader.dehydrate'],
        },
      },
      { [file]: '/posts/$postId' },
    )

    const reference = splitter.reference(codecRoute, file)!

    expect(reference).not.toMatch(/\bdehydrate\b/)
    expect(reference).toMatch(/\bhydrate\b/)
    expect(importSources(reference)).not.toContain('./server-only')
  })

  it('changes nothing when no listed key exists', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: {
    handler: () => ({ value: 'loader' }),
  },
})
`
    expect(
      compile(code, ['loader.dehydrate', 'context.revalidate', 'ssr']),
    ).toBeNull()
  })

  it('does not descend into values that are not object literals', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { loaderOptions } from './loader-options'

export const Route = createFileRoute('/')({
  loader: loaderOptions,
  beforeLoad: () => ({ value: 'beforeLoad' }),
  context: makeContext({ dehydrate: ({ data }) => toWire(data) }),
})
`
    expect(
      compile(code, [
        'loader.dehydrate',
        'beforeLoad.dehydrate',
        'context.dehydrate',
      ]),
    ).toBeNull()
  })

  it('leaves spreads and computed keys alone', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { sharedOptions } from './shared-options'

const key = 'dehydrate'

export const Route = createFileRoute('/')({
  ...sharedOptions,
  loader: {
    ...sharedOptions.loader,
    [key]: ({ data }) => toWire(data),
  },
})
`
    expect(compile(code, ['loader.dehydrate', 'ssr'])).toBeNull()
  })

  it('deletes the whole key when both the key and a path into it are listed', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: {
    handler: () => ({ value: 'loader' }),
    dehydrate: true,
  },
  component: () => null,
})
`
    for (const deleteNodes of [
      ['loader', 'loader.dehydrate'],
      ['loader.dehydrate', 'loader'],
    ]) {
      const output = compile(code, deleteNodes)!.code
      expect(output).not.toMatch(/\bloader\b/)
      expect(output).toMatch(/\bcomponent\b/)
    }
  })

  // `{ ... } satisfies T`, `{ ... } as const`, `({ ... })`: the wrapper
  // changes the type, not the object, so the dot path reaches through it
  describe('reaches through transparent TypeScript wrappers', () => {
    const wrapped = (wrap: (object: string) => string) => `
import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import type { LoaderOptions } from './types'

export const Route = createFileRoute('/')({
  loader: ${wrap(`{
    handler: () => ({ value: 'loader' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  }`)},
})
`

    it.each([
      {
        name: 'satisfies',
        wrap: (object: string) => `${object} satisfies LoaderOptions`,
      },
      { name: 'as const', wrap: (object: string) => `${object} as const` },
      { name: 'parentheses', wrap: (object: string) => `(${object})` },
      { name: 'a non-null assertion', wrap: (object: string) => `${object}!` },
      {
        name: 'an angle-bracket assertion',
        wrap: (object: string) => `<LoaderOptions>${object}`,
        filename: 'route.ts',
      },
      {
        name: 'nested wrappers',
        wrap: (object: string) =>
          `((${object} satisfies LoaderOptions) as const)!`,
      },
    ])('for a loader object wrapped in $name', ({ wrap, filename }) => {
      const code = wrapped(wrap)
      const client = compile(code, ['loader.dehydrate'], { filename })!.code
      const server = compile(code, ['loader.hydrate'], { filename })!.code

      expect(client).not.toMatch(/\bdehydrate\b/)
      expect(client).toMatch(/\bhydrate\b/)
      expect(importSources(client)).not.toContain('./server-only')
      expect(importSources(client)).toContain('./client-only')

      expect(server).toMatch(/\bdehydrate\b/)
      expect(server).not.toMatch(/\bhydrate\b/)
      expect(importSources(server)).toContain('./server-only')
      expect(importSources(server)).not.toContain('./client-only')
    })
  })

  // The route options themselves behind `satisfies` or `as`, inline or
  // held in a variable: the keys go as from a bare literal.
  it.each([
    {
      name: 'an inline literal with `satisfies`',
      declarations: '',
      argument: (options: string) => `${options} satisfies RouteOptions`,
    },
    {
      name: 'an inline literal with `as`',
      declarations: '',
      argument: (options: string) => `${options} as RouteOptions`,
    },
    {
      name: 'a variable with `satisfies`',
      declarations: 'const options = OPTIONS satisfies RouteOptions\n',
      argument: () => 'options',
    },
  ])(
    'reaches into route options given as $name',
    ({ declarations, argument }) => {
      const options = `{
  context: {
    handler: () => ({ value: 'context' }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
  ssr: true,
}`
      const code = `
import { createFileRoute } from '@tanstack/react-router'
import { toWire } from './server-only'
import { fromWire } from './client-only'
import type { RouteOptions } from './types'

${declarations.replace('OPTIONS', options)}export const Route = createFileRoute('/')(${argument(options)})
`
      const client = compile(code, ['ssr', 'context.dehydrate'])!.code
      expect(client).not.toMatch(/\b(dehydrate|ssr)\b/)
      expect(client).toContain('fromWire(data)')
      expect(importSources(client)).toEqual([
        './client-only',
        '@tanstack/react-router',
      ])

      const server = compile(code, ['context.hydrate'])!.code
      expect(server).not.toContain('fromWire(data)')
      expect(server).toContain('toWire(data)')
      expect(importSources(server)).toEqual([
        './server-only',
        '@tanstack/react-router',
      ])
    },
  )

  it('leaves an emptied object literal in place', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { fromWire } from './client-only'

export const Route = createFileRoute('/')({
  loader: {
    hydrate: ({ data }) => fromWire(data),
  },
})
`
    const output = compile(code, ['loader.hydrate'])!.code
    expect(output).toMatch(/loader:\s*\{\s*\}/)
    expect(importSources(output)).toEqual(['@tanstack/react-router'])
  })
})
