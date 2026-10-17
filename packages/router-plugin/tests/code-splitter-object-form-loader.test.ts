import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { formatSnapshot } from './format-snapshot'
import {
  buildAndRun,
  createCodeSplitterTransforms,
  declarationOf,
  expectValidModules,
  head,
  importSources,
  importedNames,
  routeFile,
} from './regression-helpers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { DeletableNodes } from '../src/core/config'

/**
 * Compiles a route file with `loader` in its own split group (plus the
 * component in another) into the reference module, the loader chunk and,
 * when bindings are shared, the shared module. Every module is formatted
 * the way the snapshot suites format theirs, so assertions can quote lines.
 */
async function compileWithSplitLoader(
  code: string,
  options: {
    groupings?: CodeSplitGroupings
    deleteNodes?: Array<DeletableNodes>
    /** `route.tsx` unless given; `route.ts` parses `<T>x` as an assertion. */
    filename?: string
  } = {},
) {
  const {
    groupings = [['loader'], ['component']],
    deleteNodes,
    filename = 'route.tsx',
  } = options
  const computed = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
    deleteNodes: deleteNodes ? new Set(deleteNodes) : undefined,
  })
  const sharedBindings = computed.size > 0 ? computed : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: groupings,
    targetFramework: 'react',
    sharedBindings,
    deleteNodes: deleteNodes ? new Set(deleteNodes) : undefined,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings,
      deleteNodes: deleteNodes ? new Set(deleteNodes) : undefined,
    }).code
  }
  if (sharedBindings) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings,
      filename: `${filename}?tsr-shared=1`,
      deleteNodes: deleteNodes ? new Set(deleteNodes) : undefined,
    }).code
  }
  for (const [name, moduleCode] of Object.entries(modules)) {
    modules[name] = await formatSnapshot(moduleCode, filename)
  }
  return {
    modules,
    reference: modules.reference!,
    loaderChunk: modules['virtual loader']!,
    sharedBindings: [...computed].sort(),
  }
}

const lazyHandler = /handler:\s*lazyFn\(\$\$splitLoaderImporter,\s*'loader'\)/

describe('loader code splitting with the object form', () => {
  it('splits only the handler and keeps the other keys in the reference file', async () => {
    const { modules, reference, loaderChunk } =
      await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
import { toWire } from './server-only'
import { fromWire } from './client-only'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: ({ params }) => fetchPosts(params),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
    staleReloadMode: 'background',
  },
  component: () => <p>posts</p>,
})
`)
    expect(reference).toMatch(lazyHandler)
    expect(reference).not.toMatch(/loader:\s*lazyFn\(/)
    expect(reference).toContain('dehydrate: ({ data }) => toWire(data)')
    expect(reference).toContain('hydrate: ({ data }) => fromWire(data)')
    expect(reference).toContain("staleReloadMode: 'background'")
    // the handler's own import moved to the chunk
    expect(importSources(reference)).toEqual([
      './client-only',
      './server-only',
      '@tanstack/react-router',
    ])

    expect(loaderChunk).toContain(
      'const SplitLoader = ({ params }) => fetchPosts(params)',
    )
    expect(loaderChunk).toContain('export { SplitLoader as loader }')
    expect(loaderChunk).not.toMatch(/\b(dehydrate|hydrate|staleReloadMode)\b/)
    expect(importSources(loaderChunk)).toEqual(['./posts'])
    await expectValidModules(modules)
  })

  it('splits a handler bound to a function declared in the file', async () => {
    const { modules, reference, loaderChunk } =
      await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
function loadPosts({ params }) {
  return fetchPosts(params)
}
export const Route = createFileRoute('/posts')({
  loader: {
    handler: loadPosts,
    dehydrate: true,
  },
  component: () => <p>posts</p>,
})
`)
    expect(reference).toMatch(lazyHandler)
    expect(reference).toContain('dehydrate: true')
    expect(reference).not.toMatch(declarationOf('loadPosts'))
    expect(importSources(reference)).toEqual(['@tanstack/react-router'])

    expect(loaderChunk).toMatch(declarationOf('loadPosts'))
    expect(loaderChunk).toContain('export { loadPosts as loader }')
    expect(importSources(loaderChunk)).toEqual(['./posts'])
    await expectValidModules(modules)
  })

  it('splits a handler bound to an import', async () => {
    const { modules, reference, loaderChunk } =
      await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: { handler: fetchPosts, hydrate: ({ data }) => data },
  component: () => <p>posts</p>,
})
`)
    expect(reference).toMatch(lazyHandler)
    expect(reference).toContain('hydrate: ({ data }) => data')
    expect(importSources(reference)).toEqual(['@tanstack/react-router'])

    expect(loaderChunk).toContain('const SplitLoader = fetchPosts')
    expect(loaderChunk).toContain('export { SplitLoader as loader }')
    await expectValidModules(modules)
  })

  it('splits a method-shorthand handler', async () => {
    const { modules, reference, loaderChunk } =
      await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: {
    async handler({ params }) {
      return fetchPosts(params)
    },
    dehydrate: true,
  },
  component: () => <p>posts</p>,
})
`)
    expect(reference).toMatch(lazyHandler)
    expect(reference).toContain('dehydrate: true')
    expect(importSources(reference)).toEqual(['@tanstack/react-router'])

    expect(loaderChunk).toMatch(
      /const SplitLoader = async function \(\{\s*params\s*\}\) \{/,
    )
    expect(loaderChunk).toContain('export { SplitLoader as loader }')
    await expectValidModules(modules)
  })

  // An accessor computes `handler` when it is read; there is no function to
  // move to the chunk, so the whole loader stays where it is.
  it.each([
    {
      name: 'a getter',
      member: `get handler() {
      return fetchPosts
    }`,
      kept: /get handler\(\) \{\s*return fetchPosts\s*\}/,
    },
    {
      name: 'a setter',
      member: `set handler(fn) {
      fetchPosts.current = fn
    }`,
      kept: /set handler\(fn\) \{\s*fetchPosts\.current = fn\s*\}/,
    },
  ])(
    'leaves a loader whose handler is $name unsplit',
    async ({ member, kept }) => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: {
    ${member},
    dehydrate: true,
  },
  component: () => <p>posts</p>,
})
`)
      expect(reference).not.toContain('lazyFn')
      expect(reference).toMatch(kept)
      expect(reference).toContain('dehydrate: true')
      expect(importSources(reference)).toEqual([
        './posts',
        '@tanstack/react-router',
      ])
      expect(loaderChunk).toBe('')
      await expectValidModules(modules)
    },
  )

  it('keeps an import a key left in the reference file still uses, and drops it when nothing does', async () => {
    const route = (
      hydrate: string,
    ) => `${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: { handler: fetchPosts, hydrate: ${hydrate} },
  component: () => <p>posts</p>,
})
`
    const sibling = await compileWithSplitLoader(
      route('({ data }) => fetchPosts.parse(data)'),
    )
    expect(sibling.reference).toMatch(lazyHandler)
    expect(sibling.reference).toContain(
      'hydrate: ({ data }) => fetchPosts.parse(data)',
    )
    expect(importSources(sibling.reference)).toEqual([
      './posts',
      '@tanstack/react-router',
    ])
    expect(sibling.loaderChunk).toContain('const SplitLoader = fetchPosts')
    expect(importSources(sibling.loaderChunk)).toEqual(['./posts'])
    await expectValidModules(sibling.modules)

    const alone = await compileWithSplitLoader(route('({ data }) => data'))
    expect(alone.reference).toMatch(lazyHandler)
    expect(importSources(alone.reference)).toEqual(['@tanstack/react-router'])
    expect(alone.loaderChunk).toContain('const SplitLoader = fetchPosts')
    expect(importSources(alone.loaderChunk)).toEqual(['./posts'])
    await expectValidModules(alone.modules)
  })

  it('keeps an import of a function-form loader that another option still uses', async () => {
    const { modules, reference, loaderChunk } =
      await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  head: () => ({ meta: [{ title: fetchPosts.title }] }),
  component: () => <p>posts</p>,
})
`)
    expect(reference).toMatch(
      /loader:\s*lazyFn\(\$\$splitLoaderImporter,\s*'loader'\)/,
    )
    expect(reference).toContain('title: fetchPosts.title')
    expect(importSources(reference)).toEqual([
      './posts',
      '@tanstack/react-router',
    ])
    expect(loaderChunk).toContain('const SplitLoader = fetchPosts')
    await expectValidModules(modules)
  })

  // `fn satisfies T`, `fn as T`, `fn!`, `(fn)`: the reference file replaces
  // the wrapped expression as a whole and the chunk exports the function
  // inside, for a function-form loader and for an object-form handler alike
  describe('reaches through transparent TypeScript wrappers around the handler', () => {
    const wrappers = [
      {
        name: 'satisfies',
        wrap: (value: string) => `${value} satisfies Loader`,
      },
      { name: 'as', wrap: (value: string) => `${value} as Loader` },
      { name: 'parentheses', wrap: (value: string) => `(${value})` },
      { name: 'a non-null assertion', wrap: (value: string) => `${value}!` },
      {
        name: 'an angle-bracket assertion',
        wrap: (value: string) => `<Loader>${value}`,
        filename: 'route.ts',
      },
      {
        name: 'nested wrappers',
        wrap: (value: string) => `((${value} satisfies Loader) as Loader)!`,
      },
    ]
    const forms = [
      {
        form: 'a function-form loader',
        loader: (value: string) => value,
        lazy: /loader:\s*lazyFn\(\$\$splitLoaderImporter,\s*'loader'\)/,
      },
      {
        form: 'an object-form handler',
        loader: (value: string) => `{ handler: ${value}, dehydrate: true }`,
        lazy: lazyHandler,
      },
    ]
    const route = (declarations: string, loader: string) =>
      `${head}import { fetchPosts } from './posts'
import type { Loader } from './types'
${declarations}export const Route = createFileRoute('/posts')({
  loader: ${loader},
  component: () => null,
})
`

    describe.each(forms)('for $form', ({ loader, lazy }) => {
      it.each(wrappers)(
        'splits an inline function wrapped in $name',
        async ({ wrap, filename }) => {
          const { modules, reference, loaderChunk } =
            await compileWithSplitLoader(
              route('', loader(wrap('(() => fetchPosts())'))),
              { filename },
            )
          expect(reference).toMatch(lazy)
          expect(importSources(reference)).toEqual(['@tanstack/react-router'])
          expect(loaderChunk).toContain(
            'const SplitLoader = () => fetchPosts()',
          )
          expect(loaderChunk).toContain('export { SplitLoader as loader }')
          expect(importSources(loaderChunk)).toEqual(['./posts'])
          await expectValidModules(modules)
        },
      )

      it.each(wrappers)(
        'splits a function declared in the file wrapped in $name',
        async ({ wrap, filename }) => {
          const { modules, reference, loaderChunk } =
            await compileWithSplitLoader(
              route(
                `function loadPosts() {
  return fetchPosts()
}
`,
                loader(wrap('loadPosts')),
              ),
              { filename },
            )
          expect(reference).toMatch(lazy)
          expect(reference).not.toMatch(declarationOf('loadPosts'))
          expect(importSources(reference)).toEqual(['@tanstack/react-router'])
          expect(loaderChunk).toMatch(declarationOf('loadPosts'))
          expect(loaderChunk).toContain('export { loadPosts as loader }')
          expect(importSources(loaderChunk)).toEqual(['./posts'])
          await expectValidModules(modules)
        },
      )

      // the reference file and the chunk must agree: an exported function
      // stays in the reference file, so the chunk must not be asked for it
      it('keeps an exported function wrapped in `as` in the reference file', async () => {
        const warn = console.warn
        console.warn = () => {}
        try {
          const { modules, reference, loaderChunk } =
            await compileWithSplitLoader(
              route(
                `export function loadPosts() {
  return fetchPosts()
}
`,
                loader('loadPosts as Loader'),
              ),
            )
          expect(reference).not.toContain('lazyFn')
          expect(reference).toContain(
            `loader: ${loader('loadPosts as Loader')}`,
          )
          expect(reference).toMatch(declarationOf('loadPosts'))
          expect(loaderChunk).not.toContain('as loader }')
          await expectValidModules(modules)
        } finally {
          console.warn = warn
        }
      })
    })
  })

  // `const postsLoader = { handler, ... }` and `loader: postsLoader`: the
  // object is resolved through its binding, like an options object passed by
  // name, and split like the inline literal: it stays in the reference file
  // with `handler: lazyFn(...)`, and the chunk exports the handler alone.
  describe('held in a same-file variable', () => {
    const keptObject =
      /const postsLoader = \{\s*handler: lazyFn\(\$\$splitLoaderImporter, 'loader'\),\s*dehydrate: true,?\s*\}/

    it('splits an inline handler out of the object', async () => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
const postsLoader = { handler: () => fetchPosts(), dehydrate: true }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`)
      expect(reference).toMatch(keptObject)
      expect(reference).toContain('loader: postsLoader')
      expect(reference).not.toMatch(/loader:\s*lazyFn\(/)
      expect(importSources(reference)).toEqual(['@tanstack/react-router'])

      expect(loaderChunk).toContain('const SplitLoader = () => fetchPosts()')
      expect(loaderChunk).toContain('export { SplitLoader as loader }')
      expect(loaderChunk).not.toMatch(declarationOf('postsLoader'))
      expect(importSources(loaderChunk)).toEqual(['./posts'])
      await expectValidModules(modules)
    })

    it('moves a handler declared in the file to the chunk', async () => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
function loadPosts() {
  return fetchPosts()
}
const postsLoader = { handler: loadPosts, dehydrate: true }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`)
      expect(reference).toMatch(keptObject)
      expect(reference).toContain('loader: postsLoader')
      expect(reference).not.toMatch(declarationOf('loadPosts'))
      expect(importSources(reference)).toEqual(['@tanstack/react-router'])

      expect(loaderChunk).toMatch(declarationOf('loadPosts'))
      expect(loaderChunk).toContain('export { loadPosts as loader }')
      expect(loaderChunk).not.toMatch(declarationOf('postsLoader'))
      expect(importSources(loaderChunk)).toEqual(['./posts'])
      await expectValidModules(modules)
    })

    it('reaches through `satisfies` on the object and `as` on the option', async () => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
import type { Loader } from './types'
const postsLoader = {
  async handler() {
    return fetchPosts()
  },
  dehydrate: true,
} satisfies Loader
export const Route = createFileRoute('/posts')({
  loader: postsLoader as Loader,
  component: () => null,
})
`)
      expect(reference).toMatch(lazyHandler)
      expect(reference).toContain('} satisfies Loader')
      expect(reference).toContain('loader: postsLoader as Loader')
      expect(importSources(reference)).toEqual(['@tanstack/react-router'])

      expect(loaderChunk).toMatch(/const SplitLoader = async function \(\) \{/)
      expect(loaderChunk).toContain('export { SplitLoader as loader }')
      expect(importSources(loaderChunk)).toEqual(['./posts'])
      await expectValidModules(modules)
    })

    it('shares a binding the handler and a key left in the object both use', async () => {
      const { modules, sharedBindings } =
        await compileWithSplitLoader(`${head}const parse = (value: unknown) => String(value)
const handlerOnly = () => 'posts'
const postsLoader = {
  handler: () => parse(handlerOnly()),
  hydrate: ({ data }) => parse(data),
}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`)
      expect(sharedBindings).toEqual(['parse'])
      expect(modules.shared).toMatch(declarationOf('parse'))
      expect(modules.reference).toMatch(lazyHandler)
      expect(modules.reference).toContain('hydrate: ({ data }) => parse(data)')
      expect(modules.reference).not.toMatch(declarationOf('parse'))
      expect(modules.reference).not.toMatch(declarationOf('handlerOnly'))
      expect(modules['virtual loader']).toMatch(declarationOf('handlerOnly'))
      expect(modules['virtual loader']).not.toMatch(declarationOf('parse'))
      expect(modules['virtual loader']).not.toMatch(
        declarationOf('postsLoader'),
      )
      await expectValidModules(modules)
    })

    // The reference file keeps reading the variable (`loader: postsLoader`),
    // so a split option reading it too makes it shared: the route and the
    // chunk get the one object from the shared module, where its handler
    // cannot be replaced, and the loader is left unsplit.
    it.each([
      {
        name: 'its own group',
        groupings: [['loader'], ['component']],
        chunk: 'virtual component',
      },
      {
        name: "the component's group",
        groupings: [['loader', 'component']],
        chunk: 'virtual loader-component',
      },
    ] satisfies Array<{
      name: string
      groupings: CodeSplitGroupings
      chunk: string
    }>)(
      'shares the object with a split component that reads it, the loader in $name',
      async ({ groupings, chunk }) => {
        const { modules, reference, sharedBindings } =
          await compileWithSplitLoader(
            `${head}import { fetchPosts } from './posts'
const postsLoader = { handler: () => fetchPosts(), staleReloadMode: 'background' }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>{postsLoader.staleReloadMode}</p>,
})
`,
            { groupings },
          )
        expect(sharedBindings).toEqual(['postsLoader'])
        expect(reference).toContain('loader: postsLoader')
        expect(reference).not.toContain('lazyFn')
        expect(importedNames(reference, 'route.tsx?tsr-shared=1')).toEqual([
          'postsLoader',
        ])
        expect(
          importedNames(modules[chunk]!, 'route.tsx?tsr-shared=1'),
        ).toEqual(['postsLoader'])
        expect(modules[chunk]).not.toContain('as loader }')
        expect(modules.shared).toContain('handler: () => fetchPosts()')
        // one declaration, in the shared module: the object is initialized once
        const declaring = Object.entries(modules)
          .filter(([, code]) => declarationOf('postsLoader').test(code))
          .map(([name]) => name)
        expect(declaring).toEqual(['shared'])
        await expectValidModules(modules)
      },
    )

    it.each([
      { name: 'its own group', groupings: [['loader'], ['component']] },
      { name: "the component's group", groupings: [['loader', 'component']] },
    ] satisfies Array<{ name: string; groupings: CodeSplitGroupings }>)(
      'initializes the object a split component reads once at runtime, the loader in $name',
      async ({ groupings }) => {
        const result = await buildAndRun(
          `${head}import { fetchPosts } from '../posts'
const postsLoader = {
  id: (globalThis.__inits = (globalThis.__inits ?? 0) + 1),
  handler: () => fetchPosts({ postId: '1' }),
  staleReloadMode: 'background',
}
export const Route = createFileRoute('/')({
  loader: postsLoader,
  component: () => <p>{postsLoader.id}</p>,
})
`,
          `const loader = entry.Route.options.loader
return {
  referenceId: loader.id,
  rendered: await entry.render(entry.Route.options.component),
  inits: globalThis.__inits,
  data: await loader.handler(),
}`,
          {
            groupings,
            files: {
              'posts.ts': `export function fetchPosts(params: { postId: string }) {
  return { postId: params.postId }
}
`,
            },
          },
        )
        expect(result).toEqual({
          referenceId: 1,
          rendered: '<p>1</p>',
          inits: 1,
          data: { postId: '1' },
        })
      },
      30_000,
    )

    // The reference file and the chunk agree on leaving the loader alone
    // when the literal is not what the route reads, or cannot be changed.
    it.each([
      {
        name: 'the variable is exported',
        declaration: `export const postsLoader = { handler: () => fetchPosts(), dehydrate: true }`,
        options: '',
        shared: false,
      },
      // both compiles keep an exported variable in the reference file, so
      // another option reading it there shares nothing
      {
        name: 'the exported variable is read by another option',
        declaration: `export const postsLoader = { handler: () => fetchPosts(), dehydrate: true }`,
        options: `head: () => ({ meta: [{ title: String(postsLoader.dehydrate) }] }),
  component: () => <p>posts</p>,`,
        shared: false,
      },
      {
        name: 'the variable is reassigned',
        declaration: `let postsLoader = { handler: () => fetchPosts(), dehydrate: true }
postsLoader = { handler: () => [], dehydrate: false }`,
        options: '',
        shared: false,
      },
      {
        name: 'the object has no handler',
        declaration: `const postsLoader = { hydrate: ({ data }) => fetchPosts.parse(data) }`,
        options: '',
        shared: false,
      },
      {
        name: 'the object moves to the shared module',
        declaration: `const postsLoader = { handler: () => fetchPosts(), staleReloadMode: 'background' }`,
        options: `head: () => ({ meta: [{ title: postsLoader.staleReloadMode }] }),
  component: () => <p>{postsLoader.staleReloadMode}</p>,`,
        shared: true,
      },
      // Splitting would replace the handler for every reader of the object:
      // `head` calling `postsLoader.handler(ctx)` would get the lazy async
      // wrapper instead of the function it wrote.
      {
        name: 'a non-split option reads the object',
        declaration: `const postsLoader = { handler: () => fetchPosts(), dehydrate: true }`,
        options: `head: (ctx) => ({ meta: [{ title: postsLoader.handler(ctx).title }] }),
  component: () => <p>posts</p>,`,
        shared: false,
      },
      {
        name: 'top-level code reads the object',
        declaration: `const postsLoader = { handler: () => fetchPosts(), dehydrate: true }
export const loadPosts = postsLoader.handler`,
        options: '',
        shared: false,
      },
      {
        name: 'its handler reads the object',
        declaration: `const postsLoader = {
  handler: () => fetchPosts(postsLoader.staleReloadMode),
  staleReloadMode: 'background',
}`,
        options: '',
        shared: false,
      },
    ])(
      'leaves the loader unsplit when $name',
      async ({ declaration, options, shared }) => {
        const warn = console.warn
        const warnings: Array<string> = []
        console.warn = (message: string) => warnings.push(message)
        try {
          const { modules, reference, loaderChunk, sharedBindings } =
            await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
${declaration}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  ${options || 'component: () => <p>posts</p>,'}
})
`)
          expect(reference).toContain('loader: postsLoader')
          expect(reference).not.toContain('lazyFn')
          expect(loaderChunk).not.toContain('as loader }')
          if (declaration.startsWith('export')) {
            expect(warnings.join('\n')).toContain('postsLoader')
          }
          if (shared) {
            expect(sharedBindings).toEqual(['postsLoader'])
            expect(modules.shared).toContain('handler: () => fetchPosts()')
            expect(reference).not.toMatch(declarationOf('postsLoader'))
          } else {
            expect(sharedBindings).toEqual([])
            expect(reference).toMatch(declarationOf('postsLoader'))
          }
          await expectValidModules(modules)
        } finally {
          console.warn = warn
        }
      },
    )

    // Types are erased, so a `typeof` of the object is no second reader:
    // the handler is split, and the object is shared with no chunk that
    // only names it in a type.
    it.each([
      {
        name: 'a top-level type',
        groupings: [['loader'], ['component']],
        declarations: `type PostsData = Awaited<ReturnType<typeof postsLoader.handler>>`,
        options: `component: () => <p>posts</p>,`,
        loaderChunk: 'virtual loader',
      },
      {
        name: 'a type of a helper of the split component',
        groupings: [['loader'], ['component']],
        declarations: `function PostsList({ posts }: { posts: Awaited<ReturnType<typeof postsLoader.handler>> }) {
  return <ul>{posts.length}</ul>
}`,
        options: `component: () => <PostsList posts={[]} />,`,
        loaderChunk: 'virtual loader',
      },
      {
        name: "a type of a helper of the split component in the loader's group",
        groupings: [['loader', 'component']],
        declarations: `function PostsList({ posts }: { posts: Awaited<ReturnType<typeof postsLoader.handler>> }) {
  return <ul>{posts.length}</ul>
}`,
        options: `component: () => <PostsList posts={[]} />,`,
        loaderChunk: 'virtual loader-component',
      },
      {
        name: 'types of two split components',
        groupings: [['loader'], ['component'], ['errorComponent']],
        declarations: `function Posts({ loader }: { loader?: typeof postsLoader }) {
  return <p>posts</p>
}
function PostsError({ loader }: { loader?: typeof postsLoader }) {
  return <p>error</p>
}`,
        options: `component: Posts,
  errorComponent: PostsError,`,
        loaderChunk: 'virtual loader',
      },
    ] satisfies Array<{
      name: string
      groupings: CodeSplitGroupings
      declarations: string
      options: string
      loaderChunk: string
    }>)(
      'splits the handler when the object is named only in $name',
      async ({ groupings, declarations, options, loaderChunk }) => {
        const { modules, reference, sharedBindings } =
          await compileWithSplitLoader(
            `${head}import { fetchPosts } from './posts'
const postsLoader = { handler: () => fetchPosts(), dehydrate: true }
${declarations}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  ${options}
})
`,
            { groupings },
          )
        expect(sharedBindings).toEqual([])
        expect(reference).toMatch(keptObject)
        expect(reference).toContain('loader: postsLoader')
        expect(importSources(reference)).toEqual(['@tanstack/react-router'])
        expect(modules[loaderChunk]).toContain(
          'const SplitLoader = () => fetchPosts()',
        )
        // the handler is exported from one chunk only
        const exporting = Object.entries(modules)
          .filter(([, code]) => code.includes('fetchPosts()'))
          .map(([name]) => name)
        expect(exporting).toEqual([loaderChunk])
        await expectValidModules(modules)
      },
    )

    it('resolves the split handler at runtime', async () => {
      const result = await buildAndRun(
        `${head}import { fetchPosts } from '../posts'
const postsLoader = {
  handler: ({ params }) => fetchPosts(params),
  dehydrate: ({ data }) => ({ ...data, wire: true }),
  staleReloadMode: 'background',
}
export const Route = createFileRoute('/')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`,
        `const loader = entry.Route.options.loader
const before = globalThis.__postsLoaded ?? 0
const data = await loader.handler({ params: { postId: '1' } })
const after = globalThis.__postsLoaded ?? 0
return {
  keys: Object.keys(loader),
  before,
  after,
  data,
  wire: loader.dehydrate({ data }),
  staleReloadMode: loader.staleReloadMode,
}`,
        {
          groupings: [['loader'], ['component']],
          files: {
            'posts.ts': `globalThis.__postsLoaded = (globalThis.__postsLoaded ?? 0) + 1
export function fetchPosts(params: { postId: string }) {
  return { postId: params.postId, title: 'post ' + params.postId }
}
`,
          },
        },
      )
      expect(result).toEqual({
        keys: ['handler', 'dehydrate', 'staleReloadMode'],
        // the chunk holding the handler and its import loads on first call
        before: 0,
        after: 1,
        data: { postId: '1', title: 'post 1' },
        wire: { postId: '1', title: 'post 1', wire: true },
        staleReloadMode: 'background',
      })
    }, 30_000)

    it('gives an option that calls the handler the function it wrote at runtime', async () => {
      const result = await buildAndRun(
        `${head}const postsLoader = {
  handler: ({ params }) => ({ title: 'post ' + params.postId }),
}
export const Route = createFileRoute('/')({
  loader: postsLoader,
  head: (ctx) => ({ meta: [{ title: postsLoader.handler(ctx).title }] }),
  component: () => <p>posts</p>,
})
`,
        `const ctx = { params: { postId: '1' } }
return {
  head: entry.Route.options.head(ctx),
  data: await entry.Route.options.loader.handler(ctx),
}`,
        { groupings: [['loader'], ['component']] },
      )
      expect(result).toEqual({
        head: { meta: [{ title: 'post 1' }] },
        data: { title: 'post 1' },
      })
    }, 30_000)

    // A loader left whole keeps its handler in the object, so what the
    // handler uses is read where the object lives and shared with a chunk
    // that reads it too: one instance, also when the loader and the
    // component are in one group.
    it.each([
      {
        name: 'read by the split component',
        declaration: `const postsLoader = { handler: () => cache.get('posts'), dehydrate: true }`,
        component: `<p>{cache.size}{String(postsLoader.dehydrate)}</p>`,
      },
      {
        name: 'reassigned',
        declaration: `let postsLoader = { handler: () => cache.get('posts') }
postsLoader = { handler: () => cache.get('other') }`,
        component: `<p>{cache.size}</p>`,
      },
    ])(
      'declares the state the handler of an object $name uses once',
      async ({ declaration, component }) => {
        const { modules } = await compileWithSplitLoader(
          `${head}const cache = new Map()
${declaration}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => ${component},
})
`,
          { groupings: [['loader', 'component']] },
        )
        const declaring = Object.entries(modules)
          .filter(([, code]) => declarationOf('cache').test(code))
          .map(([name]) => name)
        expect(declaring).toEqual(['shared'])
        await expectValidModules(modules)
      },
    )

    it('initializes the state the handler and the component in its group use once at runtime', async () => {
      const result = await buildAndRun(
        `${head}const cache = ((globalThis.__cacheInits = (globalThis.__cacheInits ?? 0) + 1), new Map())
const postsLoader = {
  handler: () => {
    cache.set('posts', 1)
    return cache.size
  },
  dehydrate: true,
}
export const Route = createFileRoute('/')({
  loader: postsLoader,
  component: () => <p>{cache.size + '-' + String(postsLoader.dehydrate)}</p>,
})
`,
        `const data = await entry.Route.options.loader.handler()
return {
  data,
  rendered: await entry.render(entry.Route.options.component),
  inits: globalThis.__cacheInits,
}`,
        { groupings: [['loader', 'component']] },
      )
      expect(result).toEqual({ data: 1, rendered: '<p>1-true</p>', inits: 1 })
    }, 30_000)
  })

  // `(undefined as any)`, `null!`: the literal under the wrapper means "no
  // value, fall back", like the bare literal. The reference file keeps the
  // option as written and the chunk exports nothing for it, for the loader
  // and the components alike, so a lazy call never asks the chunk for a
  // missing export.
  it.each([
    { key: 'loader', value: 'undefined as any' },
    { key: 'loader', value: 'null!' },
    { key: 'loader', value: 'false satisfies boolean' },
    { key: 'component', value: 'undefined as any' },
    { key: 'component', value: 'null!' },
  ])(
    'keeps `$key: ($value)` in place, like the bare literal',
    async ({ key, value }) => {
      const { modules, reference } =
        await compileWithSplitLoader(`${head}export const Route = createFileRoute('/')({
  ${key}: (${value}),
  ${key === 'loader' ? 'component: () => null' : 'loader: () => 1'},
})
`)
      expect(reference).toContain(`${key}: ${value}`)
      expect(reference).not.toContain(
        key === 'loader' ? 'lazyFn' : 'lazyRouteComponent',
      )
      expect(modules[`virtual ${key}`]).not.toContain(`as ${key} }`)
      await expectValidModules(modules)
    },
  )

  it('keeps the loader in place when the object has no handler', async () => {
    const { reference, loaderChunk } =
      await compileWithSplitLoader(`${head}export const Route = createFileRoute('/')({
  loader: { hydrate: ({ data }) => data },
})
`)
    expect(reference).toContain('loader: { hydrate: ({ data }) => data }')
    expect(reference).not.toContain('lazyFn')
    expect(loaderChunk).toBe('')
  })

  // An exported loader stays in the reference file in both compiles, so an
  // option there that reads it too shares nothing with the loader chunk.
  it('shares nothing for an exported function-form loader another option reads', async () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      const { modules, reference, loaderChunk, sharedBindings } =
        await compileWithSplitLoader(`${head}import { fetchPosts } from './posts'
export const loadPosts = () => fetchPosts()
export const Route = createFileRoute('/posts')({
  loader: loadPosts,
  head: () => ({ meta: [{ title: loadPosts.name }] }),
  component: () => <p>posts</p>,
})
`)
      expect(sharedBindings).toEqual([])
      expect(reference).toContain('export const loadPosts = () => fetchPosts()')
      expect(reference).toContain('loader: loadPosts')
      expect(loaderChunk).not.toContain('as loader }')
      await expectValidModules(modules)
    } finally {
      console.warn = warn
    }
  })

  it('keeps an exported handler in the reference file, like the function form', async () => {
    const warn = console.warn
    const warnings: Array<string> = []
    console.warn = (message: string) => warnings.push(message)
    try {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}export function loadPosts() {
  return []
}
export const Route = createFileRoute('/posts')({
  loader: { handler: loadPosts, dehydrate: true },
  component: () => <p>posts</p>,
})
`)
      expect(reference).toContain(
        'loader: { handler: loadPosts, dehydrate: true }',
      )
      expect(reference).toMatch(declarationOf('loadPosts'))
      expect(loaderChunk).not.toContain('export { loadPosts as loader }')
      expect(warnings.join('\n')).toContain('loadPosts')
      await expectValidModules(modules)
    } finally {
      console.warn = warn
    }
  })

  // `export { x }` exports a binding like `export const x` does: the option
  // that is `x` stays in the reference file with the warning. Before, the
  // specifier was overlooked: the chunk exported the whole object as the
  // loader, and a component's declaration left the reference file while its
  // export stayed behind.
  it.each([
    {
      name: 'a function-form loader',
      declaration: 'function loadPosts() {\n  return 1\n}',
      exports: 'export { loadPosts }',
      key: 'loader',
      value: 'loadPosts',
    },
    {
      name: 'an object-form loader held in a variable',
      declaration: 'const postsLoader = { handler: () => 1, dehydrate: true }',
      exports: 'export { postsLoader as loader }',
      key: 'loader',
      value: 'postsLoader',
    },
    {
      name: 'a component',
      declaration: 'function Page() {\n  return null\n}',
      exports: 'export { Page }',
      key: 'component',
      value: 'Page',
    },
  ])(
    'keeps $name exported with a specifier in the reference file',
    async ({ declaration, exports, key, value }) => {
      const warn = console.warn
      const warnings: Array<string> = []
      console.warn = (message: string) => warnings.push(message)
      try {
        const { modules, reference } =
          await compileWithSplitLoader(`${head}${declaration}
${exports}
export const Route = createFileRoute('/')({
  ${key}: ${value},
  ${key === 'loader' ? 'component: () => null' : 'loader: () => 1'},
})
`)
        expect(reference).toContain(`${key}: ${value}`)
        expect(reference).toMatch(declarationOf(value))
        expect(reference).toContain(exports)
        expect(reference).not.toContain(
          key === 'loader' ? 'lazyFn' : 'lazyRouteComponent',
        )
        expect(warnings.join('\n')).toContain(value)
        expect(modules[`virtual ${key}`]).not.toContain(`as ${key} }`)
        for (const chunk of [
          modules['virtual loader']!,
          modules['virtual component']!,
        ]) {
          expect(chunk).not.toMatch(declarationOf(value))
          expect(chunk).not.toContain(exports)
        }
        await expectValidModules(modules)
      } finally {
        console.warn = warn
      }
    },
  )

  it('splits the handler together with the components when they share a group', async () => {
    const { modules, reference } = await compileWithSplitLoader(
      `${head}import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: { handler: () => fetchPosts(), dehydrate: true },
  component: () => <p>posts</p>,
})
`,
      { groupings: [['loader', 'component']] },
    )
    expect(reference).toMatch(lazyHandler)
    expect(reference).toContain('dehydrate: true')
    const chunk = modules['virtual loader-component']!
    expect(chunk).toContain('const SplitLoader = () => fetchPosts()')
    expect(chunk).toContain('export { SplitLoader as loader }')
    expect(chunk).toContain('export { SplitComponent as component }')
    await expectValidModules(modules)
  })

  it('strips the keys an environment never reads and splits the handler in one pass', async () => {
    const code = `${head}import { fetchPosts } from './posts'
import { toWire } from './server-only'
import { fromWire } from './client-only'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: () => fetchPosts(),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
  component: () => <p>posts</p>,
})
`
    const client = await compileWithSplitLoader(code, {
      deleteNodes: ['loader.dehydrate'],
    })
    expect(client.reference).toMatch(lazyHandler)
    expect(client.reference).not.toMatch(/\bdehydrate\b/)
    expect(client.reference).toContain('hydrate: ({ data }) => fromWire(data)')
    expect(importSources(client.reference)).toEqual([
      './client-only',
      '@tanstack/react-router',
    ])
    expect(importSources(client.loaderChunk)).toEqual(['./posts'])
    await expectValidModules(client.modules)

    const server = await compileWithSplitLoader(code, {
      deleteNodes: ['loader.hydrate'],
    })
    expect(server.reference).toMatch(lazyHandler)
    expect(server.reference).not.toMatch(/\bhydrate\b/)
    expect(server.reference).toContain('dehydrate: ({ data }) => toWire(data)')
    expect(importSources(server.reference)).toEqual([
      './server-only',
      '@tanstack/react-router',
    ])
    await expectValidModules(server.modules)
  })

  // `deleteNodes` reaches an object held in a same-file variable through the
  // binding the split resolves, wherever the object ends up: the reference
  // file (loader split or kept) or the shared module (a split component
  // reads it). An import only a removed key used goes with it.
  describe('strips the keys of an object held in a same-file variable', () => {
    const code = `${head}import { fetchPosts } from './posts'
import { toWire } from './server-only'
import { fromWire } from './client-only'
const postsLoader = {
  handler: () => fetchPosts(),
  dehydrate: ({ data }) => toWire(data),
  hydrate: ({ data }) => fromWire(data),
  staleReloadMode: 'background',
}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`

    it.each([
      { name: 'split', groupings: [['loader'], ['component']] },
      { name: 'kept', groupings: [['component']] },
    ] satisfies Array<{ name: string; groupings: CodeSplitGroupings }>)(
      'in the reference file with the loader $name',
      async ({ groupings }) => {
        const client = await compileWithSplitLoader(code, {
          groupings,
          deleteNodes: ['loader.dehydrate'],
        })
        expect(client.reference).toMatch(declarationOf('postsLoader'))
        expect(client.reference).not.toMatch(/\bdehydrate\b/)
        expect(client.reference).toContain(
          'hydrate: ({ data }) => fromWire(data)',
        )
        expect(importSources(client.reference)).not.toContain('./server-only')
        expect(importSources(client.reference)).toContain('./client-only')
        await expectValidModules(client.modules)

        const server = await compileWithSplitLoader(code, {
          groupings,
          deleteNodes: ['loader.hydrate'],
        })
        expect(server.reference).not.toMatch(/\bhydrate\b/)
        expect(server.reference).toContain(
          'dehydrate: ({ data }) => toWire(data)',
        )
        expect(importSources(server.reference)).not.toContain('./client-only')
        await expectValidModules(server.modules)
      },
    )

    it('in the shared module when a split component reads the object', async () => {
      const { modules, reference, sharedBindings } =
        await compileWithSplitLoader(
          code.replace(
            'component: () => <p>posts</p>',
            'component: () => <p>{postsLoader.staleReloadMode}</p>',
          ),
          { deleteNodes: ['loader.dehydrate'] },
        )
      expect(sharedBindings).toEqual(['postsLoader'])
      expect(modules.shared).toMatch(declarationOf('postsLoader'))
      expect(modules.shared).not.toMatch(/\bdehydrate\b/)
      expect(modules.shared).toContain('hydrate: ({ data }) => fromWire(data)')
      expect(importSources(modules.shared!)).toEqual([
        './client-only',
        './posts',
      ])
      expect(reference).not.toMatch(/\bdehydrate\b/)
      expect(importSources(reference)).not.toContain('./server-only')
      await expectValidModules(modules)
    })

    it('for `context` as for `loader`', async () => {
      const { reference, modules } = await compileWithSplitLoader(
        `${head}import { toWire } from './server-only'
import { fromWire } from './client-only'
const routeContext = {
  dehydrate: ({ data }) => toWire(data),
  hydrate: ({ data }) => fromWire(data),
}
export const Route = createFileRoute('/posts')({
  context: routeContext,
  loader: () => 1,
  component: () => <p>posts</p>,
})
`,
        { deleteNodes: ['context.dehydrate'] },
      )
      expect(reference).toMatch(declarationOf('routeContext'))
      expect(reference).not.toMatch(/\bdehydrate\b/)
      expect(reference).toContain('hydrate: ({ data }) => fromWire(data)')
      expect(importSources(reference)).not.toContain('./server-only')
      await expectValidModules(modules)
    })

    // Top-level code that reads the object keeps a copy of it in every
    // chunk, which must lose the same keys as the reference file.
    it.each([
      {
        name: 'a type',
        reader:
          'type PostsData = Awaited<ReturnType<typeof postsLoader.handler>>',
      },
      {
        name: 'a statement',
        reader:
          'if (import.meta.env.DEV) { console.log(postsLoader.staleReloadMode) }',
      },
    ])(
      'in every chunk that top-level code keeps it in, read by $name',
      async ({ reader }) => {
        const kept = code.replace(
          'export const Route',
          `${reader}\nexport const Route`,
        )
        for (const groupings of [
          defaultCodeSplitGroupings,
          [['loader'], ['component']],
        ] satisfies Array<CodeSplitGroupings>) {
          const client = await compileWithSplitLoader(kept, {
            groupings,
            deleteNodes: ['loader.dehydrate'],
          })
          expect(client.modules['virtual component']).toMatch(
            declarationOf('postsLoader'),
          )
          for (const [name, moduleCode] of Object.entries(client.modules)) {
            expect(moduleCode, name).not.toMatch(/\bdehydrate\b/)
            expect(importSources(moduleCode), name).not.toContain(
              './server-only',
            )
          }
          await expectValidModules(client.modules)

          const server = await compileWithSplitLoader(kept, {
            groupings,
            deleteNodes: ['loader.hydrate'],
          })
          for (const [name, moduleCode] of Object.entries(server.modules)) {
            expect(moduleCode, name).not.toMatch(/\bhydrate\b/)
            expect(importSources(moduleCode), name).not.toContain(
              './client-only',
            )
          }
          await expectValidModules(server.modules)
        }
      },
    )

    // The literal is not what the route reads once the variable is
    // reassigned, so nothing is removed from it.
    it('leaves a reassigned variable as written', async () => {
      const { reference, modules } = await compileWithSplitLoader(
        `${head}import { toWire } from './server-only'
let postsLoader = { handler: () => [], dehydrate: ({ data }) => toWire(data) }
postsLoader = { handler: () => [], dehydrate: false }
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
`,
        { deleteNodes: ['loader.dehydrate'] },
      )
      expect(reference).toContain('dehydrate: ({ data }) => toWire(data)')
      expect(reference).toContain('dehydrate: false')
      expect(importSources(reference)).toContain('./server-only')
      await expectValidModules(modules)
    })
  })

  // The keys an environment deletes are gone before bindings are attributed
  // to modules, so a helper only such a key used goes with its import, also
  // from the shared module the object moves to; and a helper the handler and
  // a deleted key use goes to the chunk alone instead of a shared module.
  describe('shares nothing through the keys an environment deletes', () => {
    const codecs = `import { sign } from './secret.server'
import { unsign } from './client-only'
const toWire = (data: unknown) => sign(data)
const fromWire = (data: unknown) => unsign(data)
`

    it.each([
      {
        name: 'the handler reads the object',
        handler: 'async () => ({ mode: postsLoader.staleReloadMode })',
        component: '<p>posts</p>',
      },
      {
        name: 'a split component reads the object',
        handler: '() => fetchPosts()',
        component: '<p>{postsLoader.staleReloadMode}</p>',
      },
    ])(
      'keeps a codec helper out of every module when $name',
      async ({ handler, component }) => {
        const code = `${head}import { fetchPosts } from './posts'
${codecs}const postsLoader = {
  handler: ${handler},
  dehydrate: ({ data }) => toWire(data),
  hydrate: ({ data }) => fromWire(data),
  staleReloadMode: 'background',
}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => ${component},
})
`
        const client = await compileWithSplitLoader(code, {
          deleteNodes: ['loader.dehydrate'],
        })
        const server = await compileWithSplitLoader(code, {
          deleteNodes: ['loader.hydrate'],
        })
        for (const [name, moduleCode] of Object.entries(client.modules)) {
          expect(moduleCode, name).not.toMatch(/\b(toWire|sign)\b/)
          expect(importSources(moduleCode), name).not.toContain(
            './secret.server',
          )
        }
        for (const [name, moduleCode] of Object.entries(server.modules)) {
          expect(moduleCode, name).not.toMatch(/\b(fromWire|unsign)\b/)
          expect(importSources(moduleCode), name).not.toContain('./client-only')
        }
        await expectValidModules(client.modules)
        await expectValidModules(server.modules)
      },
    )

    // The plugin hands its list to the step that decides what is shared,
    // not only to the reference and shared compiles.
    it('applies the deleteNodes the plugin is configured with', async () => {
      const file = routeFile('posts')
      const splitter = await createCodeSplitterTransforms(
        {
          codeSplittingOptions: {
            addHmr: false,
            deleteNodes: ['loader.dehydrate'],
            defaultBehavior: [['loader'], ['component']],
          },
        },
        { [file]: '/posts' },
      )

      // the handler shares `toWire` only with the deleted key
      const inline = `${head}${codecs}export const Route = createFileRoute('/posts')({
  loader: {
    handler: async () => toWire(await fetch('/posts')),
    dehydrate: ({ data }) => toWire(data),
  },
  component: () => <p>posts</p>,
})
`
      expect(splitter.reference(inline, file)).not.toContain('tsr-shared')
      expect(splitter.shared(inline, `${file}?tsr-shared=1`)).toBeNull()
      const loaderChunk = splitter.virtual(inline, `${file}?tsr-split=loader`)!
      expect(loaderChunk).toMatch(declarationOf('toWire'))
      expect(loaderChunk).not.toContain('tsr-shared')

      // the object a split component reads moves to the shared module
      // without the helper only the deleted key used
      const held = `${head}${codecs}const postsLoader = {
  handler: async () => [],
  dehydrate: ({ data }) => toWire(data),
  staleReloadMode: 'background',
}
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>{postsLoader.staleReloadMode}</p>,
})
`
      splitter.reference(held, file)
      const shared = splitter.shared(held, `${file}?tsr-shared=1`)!
      expect(shared).toMatch(declarationOf('postsLoader'))
      expect(shared).not.toMatch(/\b(toWire|sign)\b/)
      expect(importSources(shared)).not.toContain('./secret.server')

      // a chunk that keeps the object for top-level code loses the key too
      const kept = held
        .replace('{postsLoader.staleReloadMode}', 'posts')
        .replace(
          'export const Route',
          'console.log(postsLoader.staleReloadMode)\nexport const Route',
        )
      splitter.reference(kept, file)
      const componentChunk = splitter.virtual(
        kept,
        `${file}?tsr-split=component`,
      )!
      expect(componentChunk).toMatch(declarationOf('postsLoader'))
      expect(componentChunk).not.toMatch(/\b(dehydrate|toWire|sign)\b/)
      expect(importSources(componentChunk)).not.toContain('./secret.server')
    })

    it('shares a helper of the handler only with the keys the environment keeps', async () => {
      const code = `${head}${codecs}export const Route = createFileRoute('/posts')({
  loader: {
    handler: async () => fromWire(toWire(await fetch('/posts'))),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
  component: () => <p>posts</p>,
})
`
      const client = await compileWithSplitLoader(code, {
        deleteNodes: ['loader.dehydrate'],
      })
      expect(client.sharedBindings).toEqual(['fromWire'])
      expect(client.loaderChunk).toMatch(declarationOf('toWire'))
      expect(client.reference).not.toMatch(/\btoWire\b/)
      await expectValidModules(client.modules)

      const server = await compileWithSplitLoader(code, {
        deleteNodes: ['loader.hydrate'],
      })
      expect(server.sharedBindings).toEqual(['toWire'])
      expect(server.loaderChunk).toMatch(declarationOf('fromWire'))
      expect(server.reference).not.toMatch(/\bfromWire\b/)
      await expectValidModules(server.modules)
    })
  })

  // The reference file splits any handler expression, so the chunk must
  // export whatever it is, or the build fails on a valid route file.
  it.each([
    {
      name: 'a member expression',
      loader: '{ handler: api.list, staleReloadMode: "background" }',
      exported: 'const SplitLoader = api.list',
    },
    {
      name: 'a logical expression',
      loader: '{ handler: api.list ?? api.fallback }',
      exported: 'const SplitLoader = api.list ?? api.fallback',
    },
    {
      name: 'a member expression in the function form',
      loader: 'api.list',
      exported: 'const SplitLoader = api.list',
    },
  ])(
    'exports a handler that is $name from the chunk',
    async ({ loader, exported }) => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}import { api } from './api'
export const Route = createFileRoute('/posts')({
  loader: ${loader},
  component: () => <p>posts</p>,
})
`)
      expect(reference).toContain(`lazyFn($$splitLoaderImporter, 'loader')`)
      expect(importSources(reference)).toEqual(['@tanstack/react-router'])
      expect(loaderChunk).toContain(exported)
      expect(loaderChunk).toContain('export { SplitLoader as loader }')
      await expectValidModules(modules)
    },
  )

  // The chunk keeps a call's type arguments and annotations as written.
  it.each([
    [
      'a generic call',
      "{ handler: makeLoader<Post>('posts') }",
      "const SplitLoader = makeLoader<Post>('posts')",
    ],
    [
      'a generic call in the function form',
      "makeLoader<Post>('posts')",
      "const SplitLoader = makeLoader<Post>('posts')",
    ],
    [
      'a call with an annotated callback',
      'makeLoader((name: string) => name)',
      'const SplitLoader = makeLoader((name: string) => name)',
    ],
  ])('exports %s from the chunk', async (_, loader, exported) => {
    const { modules, loaderChunk } =
      await compileWithSplitLoader(`${head}import { makeLoader } from './loaders'
import type { Post } from './types'
export const Route = createFileRoute('/posts')({
  loader: ${loader},
  component: () => <p>posts</p>,
})
`)
    expect(loaderChunk).toContain(exported)
    await expectValidModules(modules)
  })

  // `super` in a method refers to the object it is written in, so the
  // method cannot become a function of its own in the chunk.
  it.each([
    {
      name: 'its body',
      handler: `handler() {
      return super.toString()
    },`,
      kept: /handler\(\) \{\s*return super\.toString\(\);?\s*\}/,
    },
    {
      name: 'a parameter default',
      handler: `handler(name = super.toString()) {
      return name
    },`,
      kept: /handler\(name = super\.toString\(\)\) \{/,
    },
  ])(
    'keeps a method handler that uses `super` in $name in its object',
    async ({ handler, kept }) => {
      const { modules, reference, loaderChunk } =
        await compileWithSplitLoader(`${head}export const Route = createFileRoute('/posts')({
  loader: {
    ${handler}
  },
  component: () => <p>posts</p>,
})
`)
      expect(reference).toMatch(kept)
      expect(reference).not.toContain('lazyFn')
      expect(loaderChunk).toBe('')
      await expectValidModules(modules)
    },
  )

  it('shares a binding the handler and a key left in the reference file both use', async () => {
    const { modules, sharedBindings } =
      await compileWithSplitLoader(`${head}const parse = (value: unknown) => String(value)
const handlerOnly = () => 'posts'
export const Route = createFileRoute('/posts')({
  loader: {
    handler: () => parse(handlerOnly()),
    hydrate: ({ data }) => parse(data),
  },
  component: () => <p>posts</p>,
})
`)
    expect(sharedBindings).toEqual(['parse'])
    expect(modules.shared).toMatch(declarationOf('parse'))
    expect(modules.reference).not.toMatch(declarationOf('parse'))
    expect(modules.reference).not.toMatch(declarationOf('handlerOnly'))
    expect(modules['virtual loader']).toMatch(declarationOf('handlerOnly'))
    expect(modules['virtual loader']).not.toMatch(declarationOf('parse'))
    await expectValidModules(modules)
  })

  // The built route: `lazyFn` loads the chunk on the first call and forwards
  // to the exported handler; the other keys are read without a chunk load.
  it.each([
    {
      name: 'an inline handler',
      declarations: '',
      handler: `({ params }) => fetchPosts(params)`,
    },
    {
      name: 'a handler declared in the file',
      declarations: `function loadPosts({ params }) {
  return fetchPosts(params)
}
`,
      handler: 'loadPosts',
    },
  ])(
    'resolves the split handler at runtime with $name',
    async ({ declarations, handler }) => {
      const result = await buildAndRun(
        `${head}import { fetchPosts } from '../posts'
${declarations}export const Route = createFileRoute('/')({
  loader: {
    handler: ${handler},
    dehydrate: ({ data }) => ({ ...data, wire: true }),
    hydrate: ({ data }) => data,
    staleReloadMode: 'background',
  },
  component: () => <p>posts</p>,
})
`,
        `const loader = entry.Route.options.loader
const before = globalThis.__postsLoaded ?? 0
const data = await loader.handler({ params: { postId: '1' } })
const after = globalThis.__postsLoaded ?? 0
return {
  keys: Object.keys(loader),
  handlerType: typeof loader.handler,
  before,
  after,
  data,
  wire: loader.dehydrate({ data }),
  staleReloadMode: loader.staleReloadMode,
}`,
        {
          groupings: [['loader'], ['component']],
          files: {
            'posts.ts': `globalThis.__postsLoaded = (globalThis.__postsLoaded ?? 0) + 1
export function fetchPosts(params: { postId: string }) {
  return { postId: params.postId, title: 'post ' + params.postId }
}
`,
          },
        },
      )
      expect(result).toEqual({
        keys: ['handler', 'dehydrate', 'hydrate', 'staleReloadMode'],
        handlerType: 'function',
        // the chunk holding the handler and its import loads on first call
        before: 0,
        after: 1,
        data: { postId: '1', title: 'post 1' },
        wire: { postId: '1', title: 'post 1', wire: true },
        staleReloadMode: 'background',
      })
    },
    30_000,
  )

  // `fetchPosts` is the handler itself here, so it receives the loader context
  const postsModule = `globalThis.__postsLoaded = (globalThis.__postsLoaded ?? 0) + 1
export function fetchPosts({ params }: { params: { postId: string } }) {
  return { postId: params.postId, title: 'post ' + params.postId }
}
fetchPosts.parse = (data: { postId: string }) => ({ ...data, parsed: true })
`

  it('reads an accessor handler at runtime from the unsplit loader', async () => {
    const result = await buildAndRun(
      `${head}import { fetchPosts } from '../posts'
export const Route = createFileRoute('/')({
  loader: {
    get handler() {
      return fetchPosts
    },
    dehydrate: true,
  },
  component: () => <p>posts</p>,
})
`,
      `const loader = entry.Route.options.loader
const before = globalThis.__postsLoaded ?? 0
const data = await loader.handler({ params: { postId: '1' } })
return {
  before,
  after: globalThis.__postsLoaded ?? 0,
  data,
  dehydrate: loader.dehydrate,
}`,
      {
        groupings: [['loader'], ['component']],
        files: { 'posts.ts': postsModule },
      },
    )
    expect(result).toEqual({
      // the loader stays in the route module, so its import loads with it
      before: 1,
      after: 1,
      data: { postId: '1', title: 'post 1' },
      dehydrate: true,
    })
  }, 30_000)

  it('runs a hydrate that uses the split handler import at runtime', async () => {
    const result = await buildAndRun(
      `${head}import { fetchPosts } from '../posts'
export const Route = createFileRoute('/')({
  loader: {
    handler: fetchPosts,
    hydrate: ({ data }) => fetchPosts.parse(data),
  },
  component: () => <p>posts</p>,
})
`,
      `const loader = entry.Route.options.loader
const data = await loader.handler({ params: { postId: '1' } })
return {
  loaded: globalThis.__postsLoaded ?? 0,
  data,
  hydrated: loader.hydrate({ data }),
}`,
      {
        groupings: [['loader'], ['component']],
        files: { 'posts.ts': postsModule },
      },
    )
    expect(result).toEqual({
      // one module instance, shared by the route module and the chunk
      loaded: 1,
      data: { postId: '1', title: 'post 1' },
      hydrated: { postId: '1', title: 'post 1', parsed: true },
    })
  }, 30_000)
})

// A function-form loader is moved whole into the chunk, whatever expression
// holds it.
describe('a split function-form loader value', () => {
  const lazyLoader = `loader: lazyFn($$splitLoaderImporter, 'loader')`

  it.each([
    [
      'an imported binding',
      `import { postsLoader } from './loaders'\n`,
      'postsLoader',
    ],
    [
      'a call result',
      `import { makeLoader } from './loaders'\n`,
      'makeLoader()',
    ],
    ['a member', `import { loaders } from './loaders'\n`, 'loaders.posts'],
    [
      'a variable holding a call result',
      `import { makeLoader } from './loaders'\nconst postsLoader = makeLoader()\n`,
      'postsLoader',
    ],
    [
      'a destructured binding',
      `import { makeBits } from './loaders'\nconst { loader: postsLoader } = makeBits()\n`,
      'postsLoader',
    ],
    [
      'a reassigned variable',
      `import { makeLoader } from './loaders'\nlet postsLoader = () => 1\npostsLoader = makeLoader()\n`,
      'postsLoader',
    ],
    ['an inline arrow', '', '({ params }) => params'],
    ['an inline function', '', 'async function () { return 1 }'],
    [
      'a function declared in the file',
      'function postsLoader() { return 1 }\n',
      'postsLoader',
    ],
    [
      'a variable holding an arrow',
      'const postsLoader = () => 1\n',
      'postsLoader as any',
    ],
  ])('splits %s', async (_, declarations, value) => {
    const { modules, reference, loaderChunk } = await compileWithSplitLoader(
      `${head}${declarations}export const Route = createFileRoute('/posts')({
  loader: ${value},
  component: () => <p>posts</p>,
})
`,
    )
    expect(reference).toContain(lazyLoader)
    expect(loaderChunk).toContain('as loader }')
    await expectValidModules(modules)
  })

  it('leaves an inline object-form loader, hydrate included, in the reference file under the default groupings', async () => {
    const { reference } = await compileWithSplitLoader(
      `${head}export const Route = createFileRoute('/posts')({
  loader: { handler: () => fetchPosts(), dehydrate: true, hydrate: ({ data }) => data },
  component: () => <p>posts</p>,
})
`,
      { groupings: defaultCodeSplitGroupings },
    )
    expect(reference).toContain('hydrate: ({ data }) => data')
    expect(reference).not.toMatch(/lazyFn\(/)
  })

  it('fails to call an imported object-form loader, with an error that says where to write it', async () => {
    const result = await buildAndRun(
      `${head}import { objectLoader } from '../loaders'
export const Route = createFileRoute('/')({
  loader: objectLoader,
  component: () => <p>posts</p>,
})
`,
      `return entry.Route.options.loader({}).then(
  () => 'resolved',
  (error) => error.message,
)`,
      {
        groupings: [['loader'], ['component']],
        files: {
          'loaders.ts': `export const objectLoader = {
  handler: () => ({ items: ['a', 'b'] }),
}
`,
        },
      },
    )
    expect(result).toBe(
      'TanStack Router: the lazily imported `loader` is an object-form loader, which cannot be code split as a whole. Write it in the route file, inline or in a `const` there.',
    )
  }, 30_000)
})
