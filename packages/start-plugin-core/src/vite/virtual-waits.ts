/**
 * A Vite build reads a virtual module's raw text through `this.load`, which
 * hands it over once the module's transforms are done, the compile of
 * Start's own transform among them. A compile of a virtual module that waits
 * for the text of a virtual module whose compile waits, directly or through
 * others, for the waiting one (its own text, through a server-only marker;
 * virtual modules importing each other) would never end, and the build would
 * hang: that wait fails instead, naming the modules. Compiles of files never
 * close such a cycle (a file's text is read from disk).
 */

/** The `HostServices.awaitVirtual` of compiles of virtual modules, per environment of one build. */
export function createVirtualWaits(): {
  of: (
    env: string,
    subject: string,
  ) => <T>(target: string, read: Promise<T>) => Promise<T>
} {
  /** Per environment: the virtual texts each compile of a virtual module waits for (with a count per text). */
  const graphs = new Map<string, Map<string, Map<string, number>>>()

  return {
    of: (env, subject) => async (target, read) => {
      let graph = graphs.get(env)
      if (!graph) {
        graph = new Map()
        graphs.set(env, graph)
      }
      let waits = graph.get(subject)
      if (!waits) {
        waits = new Map()
        graph.set(subject, waits)
      }
      waits.set(target, (waits.get(target) ?? 0) + 1)
      const state = { settled: false }
      read.then(
        () => {
          state.settled = true
        },
        () => {
          state.settled = true
        },
      )
      try {
        // a text the cache holds settles in microtasks (`build --watch`
        // keeps them): only a wait still open after them can be one that
        // never ends
        await new Promise((resolve) => setImmediate(resolve))
        if (!state.settled) {
          const cycle = pathOf(graph, target, subject)
          if (cycle) {
            throw new Error(cycleMessage([subject, ...cycle]))
          }
        }
        return await read
      } finally {
        const count = waits.get(target)! - 1
        if (count > 0) {
          waits.set(target, count)
        } else {
          waits.delete(target)
          if (waits.size === 0 && graph.get(subject) === waits) {
            graph.delete(subject)
          }
        }
      }
    },
  }
}

/** The modules from `from` to `to` along the waits of `graph` (`[from]` when they are the same), or null. */
function pathOf(
  graph: Map<string, Map<string, number>>,
  from: string,
  to: string,
  seen = new Set<string>(),
): Array<string> | null {
  if (from === to) {
    return [from]
  }
  seen.add(from)
  for (const next of graph.get(from)?.keys() ?? []) {
    if (seen.has(next)) {
      continue
    }
    const rest = pathOf(graph, next, to, seen)
    if (rest) {
      return [from, ...rest]
    }
  }
  return null
}

/** `cycle`: the waiting module, the module it waits for, …, the waiting module again. */
function cycleMessage(cycle: Array<string>): string {
  const names = cycle.map((id) => JSON.stringify(id.replace(/^\0/, '')))
  const what =
    cycle.length === 2
      ? `the virtual module ${names[0]}, which needs its own code to compile (a server-only marker in it does)`
      : `the virtual modules ${names.join(' → ')}, which import each other`
  return `[tanstack-start] A Vite build can't compile ${what}: Vite hands the compiler a virtual module's code only once the module is compiled. Move the code into a file of the project.`
}
