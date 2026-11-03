import { describe, expect, it } from 'vitest'
import { rebuildModules } from '../src/compiler'

const moduleOf = (name: string) => ({
  resource: `/app/${name}`,
  identifier: () => name,
})

describe('rebuildModules', () => {
  it('rebuilds the modules of the paths once each, and not one a rebuild removed', async () => {
    const parent = moduleOf('parent')
    const child = moduleOf('child')
    const modules = new Set([
      parent,
      child,
      moduleOf('other'),
      moduleOf('unrelated'),
    ])
    const rebuilt: Array<string> = []
    await rebuildModules(
      {
        get modules() {
          return new Set(modules)
        },
        rebuildModule(m, callback) {
          if (!modules.has(m)) {
            throw new Error('a module outside the graph')
          }
          rebuilt.push(m.identifier())
          if (m === parent) {
            modules.delete(child)
          }
          callback()
        },
      },
      new Set(['/app/parent', '/app/child', '/app/other']),
      (resource) => resource,
    )
    expect(rebuilt).toEqual(['parent', 'other'])
  })

  it('reads the graph once, not once per rebuild', async () => {
    const modules = new Set(
      Array.from({ length: 1000 }, (_, i) => moduleOf(`m${i}`)),
    )
    let visited = 0
    const counted: ReadonlySet<ReturnType<typeof moduleOf>> = {
      has: (m) => modules.has(m),
      get size() {
        return modules.size
      },
      *[Symbol.iterator]() {
        for (const m of modules) {
          visited++
          yield m
        }
      },
    } as ReadonlySet<ReturnType<typeof moduleOf>>
    const paths = new Set(
      Array.from({ length: 100 }, (_, i) => `/app/m${i * 10}`),
    )
    let rebuilt = 0
    await rebuildModules(
      {
        modules: counted,
        rebuildModule(_m, callback) {
          rebuilt++
          callback()
        },
      },
      paths,
      (resource) => resource,
    )
    expect(rebuilt).toBe(100)
    expect(visited).toBe(modules.size)
  })
})
