import { describe, expect, it, onTestFinished, vi } from 'vitest'
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
    const drain = new StaleSetDrain(caches, {
      tag: '[tanstack-router]',
      root: '/app',
    })
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
    const warnings: Array<string> = []
    const warn = vi.spyOn(console, 'warn').mockImplementation((message) => {
      warnings.push(String(message))
    })
    onTestFinished(() => warn.mockRestore())
    return { caches, drain, compiler, warnings }
  }

  it('asks an idle compiler for at most three compilations that each leave its set full, then names the files once', () => {
    const { caches, drain, compiler, warnings } = drainOf()
    // a module whose rebuild finds itself stale again, every time
    for (let i = 0; i < 6; i++) {
      caches.stale.add('client', '/app/a.ts')
      drain.compiled('client')
    }
    expect(compiler.asked).toBe(3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('a.ts')
    // a file event of its own, or a registry change, may ask again
    drain.caused('client')
    drain.compiled('client')
    expect(compiler.asked).toBe(4)
    drain.registryChanged()
    expect(compiler.asked).toBe(5)
  })

  it('keeps asking while each compilation it asked for empties the set', () => {
    const { caches, drain, compiler, warnings } = drainOf()
    for (let i = 0; i < 6; i++) {
      // another environment's event, a compile overtaken: filled while idle
      caches.stale.add('client', `/app/m${i}.ts`)
      drain.compiled('client')
      // the compilation asked for takes the set
      caches.stale.take('client', { held: true })
      drain.compiled('client')
    }
    expect(compiler.asked).toBe(6)
    expect(warnings).toEqual([])
  })

  it("asks the compiler that starts an environment's compilations for its set", () => {
    const { caches, drain, compiler: server } = drainOf()
    const client = {
      idle: true,
      asked: 0,
      watching: { invalidate: () => client.asked++ },
    }
    drain.register('rsc-client', client, 'client')
    caches.stale.add('rsc-client', '/app/a.ts')
    drain.compiled('rsc-client')
    expect([client.asked, server.asked]).toEqual([0, 1])
  })

  it('asks nothing of a compiling compiler, or of one with nothing stale', () => {
    const { caches, drain, compiler } = drainOf()
    drain.compiled('client')
    compiler.idle = false
    caches.stale.add('client', '/app/a.ts')
    drain.compiled('client')
    expect(compiler.asked).toBe(0)
  })

  it('rebuilds the set, held paths too, and of the paths a compilation builds from its own events the modules it did not build', async () => {
    const { caches, drain } = drainOf()
    caches.stale.add('client', '/app/a.ts')
    caches.stale.add('client', '/app/b.ts', true)
    caches.stale.add('client', '/app/c.ts')
    caches.stale.add('client', '/app/d.ts')
    // c.ts and d.ts changed; the bundler builds c.ts, d.ts was written again unchanged
    drain.building('client', ['/app/c.ts', '/app/d.ts', '/app/e.ts'])
    expect(caches.stale.paths('client').sort()).toEqual([
      '/app/a.ts',
      '/app/b.ts',
    ])
    const modules = new Set(
      ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(moduleOf),
    )
    const rebuilt: Array<string> = []
    await drain.rebuild(
      'client',
      {
        modules,
        builtModules: new Set(
          [...modules].filter((m) => ['c.ts', 'e.ts'].includes(m.identifier())),
        ),
        rebuildModule(m, callback) {
          rebuilt.push(m.identifier())
          callback()
        },
      },
      (resource) => resource,
    )
    expect(rebuilt).toEqual(['a.ts', 'b.ts', 'd.ts'])
    expect(caches.stale.has('client')).toBe(false)
  })
})
