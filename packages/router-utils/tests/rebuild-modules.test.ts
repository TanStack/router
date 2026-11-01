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
})
