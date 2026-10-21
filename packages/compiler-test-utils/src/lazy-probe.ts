/**
 * @deprecated Observes laziness in the Node module graph of
 * `./module-linker` (RULES-AUDIT §2.D #8): laziness is the bundler's and
 * the browser's (`./build-harness` chunk placement, the page's requests in
 * `./browser`). Kept for the callers that have not moved yet
 * (validation/REPAIR/A2.md).
 *
 * Observes lazy loading in a module graph (`module-linker.ts`) by the modules
 * actually evaluated when a value's real trigger completes, never by
 * recognising the helper that builds a lazy value (SPEC J2.6, §5.3, §5.8):
 * `lazyRouteComponent`, `lazyFn`, `React.lazy`, an equivalent wrapper, a
 * wrapper that first awaits something else, or an intermediate module that
 * loads the value's module itself (a dynamic facade) all pass.
 *
 * API: `createLazyProbe(graph, entry, triggers, { owned })` →
 * - `isLazy(name)`: completing the trigger of `name` evaluates an owned
 *   module that did not load with `entry`.
 * - `loadedBy(name)`: ids of the owned modules completing it evaluates, in
 *   evaluation order (one or more: facades and support modules are allowed).
 * - `groups(names)`: the lazy `names` grouped by what loads together: once
 *   one has loaded, completing the trigger of every other of its group
 *   evaluates nothing new. Each pair is observed on its own, so a name of
 *   another group may share support modules without joining the group. Each
 *   group sorted, groups sorted. A group that pulls another group's name in
 *   without the reverse shows as two overlapping groups.
 *
 * `triggers[name](exports)` starts loading `name` the way its runtime does,
 * given the namespace of `entry` (a router's `component.preload()`, a loader
 * call, a Hydrate boundary's `prefetch`…), and returns what it returns: the
 * probe awaits it (a rejection is ignored: a value that is not lazy may run
 * user code that throws), then lets the modules it started importing
 * without awaiting them finish loading. Every observation runs in its own
 * fork of the graph (fresh module instances, the same stubs), so the graph
 * a test inspects loads nothing it did not ask for, and one observation
 * never sees what another loaded. `owned(id)` tells the modules that count
 * (default: modules of the graph, not stubs or packages).
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

  /**
   * Completes the trigger of `name` in `forked` and returns the owned
   * modules that evaluated meanwhile, in evaluation order.
   */
  const complete = async (forked: Fork, name: string) => {
    const owned = options.owned ?? forked.graph.has
    const evaluatedBefore = forked.graph.evaluated.length
    const requestedBefore = forked.graph.requested.length
    try {
      await triggers[name]?.(forked.exports)
    } catch {
      // A value that is not lazy ran (e.g. a loader without arguments)
    }
    // Imports the trigger started without awaiting them: the same native
    // loads, awaited until they settle.
    for (const id of forked.graph.requested.slice(requestedBefore)) {
      if (owned(id) && !forked.graph.evaluated.includes(id)) {
        await forked.graph.import(id).catch(() => undefined)
      }
    }
    return forked.graph.evaluated.slice(evaluatedBefore).filter(owned)
  }

  const loaded = new Map<string, Promise<Array<string>>>()
  /** The owned modules completing `name`'s trigger evaluates (in a fork). */
  const loadedBy = (name: string) => {
    let modules = loaded.get(name)
    if (!modules) {
      modules = fork().then((forked) => complete(forked, name))
      loaded.set(name, modules)
    }
    return modules
  }
  const isLazy = async (name: string) => (await loadedBy(name)).length > 0

  /** Whether `other` evaluates nothing new once `name` has loaded. */
  const availableAfter = async (name: string, other: string) => {
    const forked = await fork()
    await complete(forked, name)
    return (await complete(forked, other)).length === 0
  }

  return {
    isLazy,
    loadedBy: async (name) => [...(await loadedBy(name))],
    async groups(names) {
      const lazy: Array<string> = []
      for (const name of names) {
        if (await isLazy(name)) {
          lazy.push(name)
        }
      }
      const groups = new Map<string, Array<string>>()
      for (const name of lazy) {
        const group = [name]
        for (const other of lazy) {
          if (other !== name && (await availableAfter(name, other))) {
            group.push(other)
          }
        }
        group.sort()
        groups.set(group.join('+'), group)
      }
      return [...groups.values()].sort((a, b) =>
        a.join('+').localeCompare(b.join('+')),
      )
    },
  }
}
