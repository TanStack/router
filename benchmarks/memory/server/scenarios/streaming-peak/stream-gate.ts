// Deferred sections resolve when the bench opens their gate after reading the
// previous stage's output, instead of after timers, so streaming order and
// chunking are a function of events, not runner speed (see shared.ts). The
// built app and the bench load this file as separate module instances, so the
// gates live on globalThis.

export const deferredSectionCount = 4

const registryKey = Symbol.for('tanstack.memory-bench.streaming-peak.gates')

function getRegistry(): Map<string, Array<() => void>> {
  const scope = globalThis as typeof globalThis & {
    [registryKey]?: Map<string, Array<() => void>>
  }

  return (scope[registryKey] ??= new Map())
}

/** App side: one promise per deferred section of the request `id`. */
export function createSectionGates(id: string): Array<Promise<void>> {
  const openers: Array<() => void> = []
  const gates = Array.from(
    { length: deferredSectionCount },
    () => new Promise<void>((resolve) => openers.push(resolve)),
  )

  getRegistry().set(id, openers)

  return gates
}

/** Bench side: resolves deferred section `index` of the request `id`. */
export function openSectionGate(id: string, index: number) {
  const registry = getRegistry()
  const openers = registry.get(id)

  if (index === deferredSectionCount - 1) {
    registry.delete(id)
  }

  openers?.[index]?.()
}
