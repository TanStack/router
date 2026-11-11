import { describe, expect, it } from 'vitest'
import { StaleSetDrain, rebuildModules } from '../src/compiler'
import { MemoryHost } from './helpers'

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

describe('StaleSetDrain', () => {
  const drainOf = () => {
    const { caches } = new MemoryHost({ files: {} })
    const drain = new StaleSetDrain(caches)
    const compiler = {
      idle: true,
      asked: 0,
      watching: {
        invalidate: () => {
          compiler.asked++
        },
      },
    }
    drain.register('client', compiler)
    return { caches, drain, compiler }
  }

  it('asks an idle compiler with a stale set for at most three compilations without a cause', () => {
    const { caches, drain, compiler } = drainOf()
    // a module whose rebuild finds itself stale again, every time
    for (let i = 0; i < 5; i++) {
      caches.stale.add('client', '/app/a.ts')
      drain.wake()
    }
    expect(compiler.asked).toBe(3)
    // a file event of its own, or a registry change, may ask again
    drain.caused('client')
    drain.wake()
    expect(compiler.asked).toBe(4)
    drain.registryChanged()
    expect(compiler.asked).toBe(5)
  })

  it('asks nothing of a compiling compiler, or of one with nothing stale', () => {
    const { caches, drain, compiler } = drainOf()
    drain.wake()
    compiler.idle = false
    caches.stale.add('client', '/app/a.ts')
    drain.wake()
    expect(compiler.asked).toBe(0)
  })

  it("rebuilds the set's modules, held ones too, and none a compilation builds from its own events", async () => {
    const { caches, drain } = drainOf()
    caches.stale.add('client', '/app/a.ts')
    caches.stale.add('client', '/app/b.ts', true)
    caches.stale.add('client', '/app/c.ts')
    drain.building('client', ['/app/c.ts'])
    const modules = new Set(['a.ts', 'b.ts', 'c.ts'].map(moduleOf))
    const rebuilt: Array<string> = []
    await drain.rebuild(
      'client',
      {
        modules,
        rebuildModule(m, callback) {
          rebuilt.push(m.identifier())
          callback()
        },
      },
      (resource) => resource,
    )
    expect(rebuilt).toEqual(['a.ts', 'b.ts'])
    expect(caches.stale.has('client')).toBe(false)
  })
})
