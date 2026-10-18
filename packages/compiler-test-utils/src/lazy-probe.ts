/**
 * Observes lazy loading in a module graph (`module-linker.ts`) by the modules
 * actually requested, never by recognising the helper that builds a lazy
 * value (SPEC J2.6, §5.3, §5.8): `lazyRouteComponent`, `lazyFn`,
 * `React.lazy`, an equivalent wrapper or an intermediate module all pass.
 *
 * API: `createLazyProbe(graph, entry, triggers, { owned })` →
 * - `isLazy(name)`: starting to load `name` requests a module that did not
 *   load with `entry` (probed: nothing loads).
 * - `loadedBy(name)`: ids of the modules loading `name` evaluates, in
 *   evaluation order (one or more: facades and support modules are allowed).
 * - `groups(names)`: the lazy `names` grouped by what loads together:
 *   loading one makes every other of its group available (starting it
 *   requests nothing that has not loaded), while a name of another group
 *   stays unrequested. Each group sorted, groups sorted. A group that pulls
 *   another group's name in without the reverse shows as two overlapping
 *   groups.
 *
 * `triggers[name](exports)` starts loading `name` the way its runtime does,
 * given the namespace of `entry` (a router's `component.preload()`, a loader
 * call, a Hydrate boundary's `prefetch`…). It runs in forks of the graph
 * (fresh module instances, the same stubs), so the graph a test inspects
 * loads nothing it did not ask for; a trigger of a value that is not lazy
 * may run user code there. Loading a name imports the modules its trigger
 * requests (without awaiting the trigger itself). `owned(id)` tells the
 * modules that count (default: modules of the graph, not stubs or
 * packages).
 */
import type { ModuleGraph } from './module-linker'

export interface LazyProbe {
  isLazy: (name: string) => Promise<boolean>
  loadedBy: (name: string) => Promise<Array<string>>
  groups: (names: Array<string>) => Promise<Array<Array<string>>>
}

export function createLazyProbe(
  graph: ModuleGraph,
  entry: string,
  triggers: Record<string, (exports: Record<string, any>) => unknown>,
  options: { owned?: (id: string) => boolean } = {},
): LazyProbe {
  const fork = async () => {
    const forked = graph.fork()
    return { graph: forked, exports: await forked.import(entry) }
  }
  type Fork = Awaited<ReturnType<typeof fork>>
  /** The owned modules whose import starting to load `name` starts. */
  const probe = ({ graph: forked, exports }: Fork, name: string) =>
    forked
      .probeDynamicImports(() => {
        try {
          return triggers[name]?.(exports)
        } catch {
          // A value that is not lazy ran (e.g. a loader without arguments)
          return undefined
        }
      })
      .filter(options.owned ?? forked.has)
  /** Loads `name` in a fork: the modules its trigger requests. */
  const load = async (forked: Fork, name: string) => {
    for (const id of probe(forked, name)) {
      await forked.graph.import(id)
    }
  }

  // One fork answers every `isLazy`, each name probed once: a lazy value
  // may still be settling its probed (rejected) import when probed again.
  let probeFork: Promise<Fork> | undefined
  const laziness = new Map<string, Promise<boolean>>()
  const isLazy = (name: string) => {
    let lazy = laziness.get(name)
    if (!lazy) {
      probeFork ??= fork()
      lazy = probeFork.then((forked) => probe(forked, name).length > 0)
      laziness.set(name, lazy)
    }
    return lazy
  }

  return {
    isLazy,
    async loadedBy(name) {
      const forked = await fork()
      const before = forked.graph.evaluated.length
      await load(forked, name)
      return forked.graph.evaluated.slice(before)
    },
    async groups(names) {
      const lazy: Array<string> = []
      for (const name of names) {
        if (await isLazy(name)) {
          lazy.push(name)
        }
      }
      const groups = new Map<string, Array<string>>()
      for (const name of lazy) {
        const forked = await fork()
        await load(forked, name)
        const evaluated = new Set(forked.graph.evaluated)
        const group = lazy
          .filter(
            (other) =>
              other === name ||
              probe(forked, other).every((id) => evaluated.has(id)),
          )
          .sort()
        groups.set(group.join('+'), group)
      }
      return [...groups.values()].sort((a, b) =>
        a.join('+').localeCompare(b.join('+')),
      )
    },
  }
}
