import * as React from 'react'
const { useState, useEffect, useLayoutEffect, useDebugValue } = React

let didWarnOld18Alpha = false
let didWarnUncachedGetSnapshot = false

export function useSyncExternalStore<T>(
  subscribe: (cb: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const value = getSnapshot()

  // Because updates are synchronous, we don't queue them. Instead we force a
  // re-render whenever the subscribed state changes by updating an some
  // arbitrary useState hook. Then, during render, we call getSnapshot to read
  // the current value.
  //
  // Because we don't actually use the state returned by the useState hook, we
  // can save a bit of memory by storing other stuff in that slot.
  //
  // To implement the early bailout, we need to track some things on a mutable
  // object. Usually, we would put that in a useRef hook, but we can stash it in
  // our useState hook instead.
  //
  // To force a re-render, we call forceUpdate({inst}). That works because the
  // new object always fails an equality check.
  const [{ inst }, forceUpdate] = useState({ inst: { value, getSnapshot } })

  // Track the latest getSnapshot function with a ref. This needs to be updated
  // in the layout phase so we can access it during the tearing check that
  // happens on subscribe.
  useLayoutEffect(() => {
    inst.value = value
    inst.getSnapshot = getSnapshot

    // Whenever getSnapshot or subscribe changes, we need to check in the
    // commit phase if there was an interleaved mutation. In concurrent mode
    // this can happen all the time, but even in synchronous mode, an earlier
    // effect may have mutated the store.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceUpdate({ inst })
    }
  }, [subscribe, value, getSnapshot])

  useEffect(() => {
    // Check for changes right before subscribing. Subsequent changes will be
    // detected in the subscription handler.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceUpdate({ inst })
    }
    const handleStoreChange = () => {
      // TODO: Because there is no cross-renderer API for batching updates, it's
      // up to the consumer of this library to wrap their subscription event
      // with unstable_batchedUpdates. Should we try to detect when this isn't
      // the case and print a warning in development?

      // The store changed. Check if the snapshot changed since the last time we
      // read from the store.
      if (checkIfSnapshotChanged(inst)) {
        // Force a re-render.
        forceUpdate({ inst })
      }
    }
    // Subscribe to the store and return a clean-up function.
    return subscribe(handleStoreChange)
  }, [subscribe])

  useDebugValue(value)
  return value
}

function checkIfSnapshotChanged<T>(inst: {
  value: T
  getSnapshot: () => T
}): boolean {
  const latestGetSnapshot = inst.getSnapshot
  const prevValue = inst.value
  try {
    const nextValue = latestGetSnapshot()
    return !Object.is(prevValue, nextValue)
  } catch (error) {
    return true
  }
}
