import { describe, expect, it } from 'vitest'
import { buildAndRun, compileRouteModules } from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

function compileReference(code: string) {
  const { modules, sharedBindings } = compileRouteModules(code)
  return { sharedBindings, reference: modules.reference! }
}

describe('split options that read the Route singleton', () => {
  // `Route` itself stays in the reference module, so reading it from a split
  // option must not attribute every dependency of the route options to that
  // option's chunk.
  it.each([
    {
      name: 'an inline arrow component',
      component: `() => {
    const posts = Route.useLoaderData()
    return <ul>{posts.length}</ul>
  }`,
    },
    {
      name: 'an inline named function component',
      component: `function Posts() {
    const { page } = Route.useSearch()
    return <p>{page}</p>
  }`,
    },
  ])(
    'keeps loader-only helpers in the reference module for $name',
    async ({ component }) => {
      const { sharedBindings, reference } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
const formatter = new Intl.NumberFormat('en')
async function fetchPosts() {
  return [formatter.format(1)]
}
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: ${component},
})
`)

      expect(sharedBindings).toEqual([])
      expect(reference).not.toContain('tsr-shared')
      expect(reference).toMatch(declarationOf('fetchPosts'))
      expect(reference).toMatch(declarationOf('formatter'))
      expect(await getModuleErrors(reference)).toEqual([])
    },
  )

  it('does not turn a reassigned loader-only binding into an import', () => {
    const { sharedBindings, reference } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`)

    expect(sharedBindings).toEqual([])
    // An imported binding is read-only: `label = ...` would throw at runtime
    expect(reference).not.toMatch(/import\s*\{[^}]*\blabel\b/)
    expect(reference).toMatch(declarationOf('label'))
  })

  it('still runs a route whose loader reads a reassigned binding', async () => {
    const loaded = await buildAndRun({
      files: {
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/')({
  loader: () => label,
  component: () => Route.useLoaderData(),
})
`,
      },
      script: 'return entry.Route.options.loader({})',
    })
    expect(loaded).toBe('updated')
  }, 30_000)

  it('keeps sharing a binding that the component and the loader both read', () => {
    const { sharedBindings } = compileReference(`
import { createFileRoute } from '@tanstack/react-router'
const formatName = (name: string) => name.toUpperCase()
export const Route = createFileRoute('/user')({
  loader: () => formatName('a'),
  component: () => <h1>{formatName(Route.useLoaderData())}</h1>,
})
`)

    expect(sharedBindings).toEqual(['formatName'])
  })
})
