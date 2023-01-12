/**
 * This function converts a store to an immutable value, which is
 * more complex than you think. On first read, (when prev is undefined)
 * every value must be recursively touched so tracking is "deep".
 * Every object/array structure must also be cloned to
 * have a new reference, otherwise it will get mutated by subsequent
 * store updates.
 *
 * In the case that prev is supplied, we have to do deep comparisons
 * between prev and next objects/array references and if they are deeply
 * equal, we can return the prev version for referential equality.
 */
export function storeToImmutable<T>(prev: any, next: T): T {
  const cache = new Map()

  // Visit all nodes
  // clone all next structures
  // from bottom up, if prev === next, return prev

  function recurse(prev: any, next: any) {
    if (cache.has(next)) {
      return cache.get(next)
    }

    const prevIsArray = Array.isArray(prev)
    const nextIsArray = Array.isArray(next)
    const prevIsObj = isPlainObject(prev)
    const nextIsObj = isPlainObject(next)
    const nextIsComplex = nextIsArray || nextIsObj

    const isArray = prevIsArray && nextIsArray
    const isObj = prevIsObj && nextIsObj

    const isSameStructure = isArray || isObj

    if (nextIsComplex) {
      const prevSize = isArray
        ? prev.length
        : isObj
        ? Object.keys(prev).length
        : -1
      const nextKeys = isArray ? next : Object.keys(next)
      const nextSize = nextKeys.length

      let changed = false
      const copy: any = nextIsArray ? [] : {}

      for (let i = 0; i < nextSize; i++) {
        const key = isArray ? i : nextKeys[i]
        const prevValue = isSameStructure ? prev[key] : undefined
        const nextValue = next[key]

        // Recurse the new value
        try {
          // console.count(key)
          copy[key] = recurse(prevValue, nextValue)
        } catch {}

        // If the new value has changed reference,
        // mark the obj/array as changed
        if (!changed && copy[key] !== prevValue) {
          changed = true
        }
      }

      // No items have changed!
      // If something has changed, return a clone of the next obj/array
      if (changed || prevSize !== nextSize) {
        cache.set(next, copy)
        return copy
      }

      // If they are exactly the same, return the prev obj/array
      cache.set(next, prev)
      return prev
    }

    cache.set(next, next)
    return next
  }

  return recurse(prev, next)
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between immutable JSON values for example.
 * Do not use this with signals
 */
export function replaceEqualDeep<T>(prev: any, _next: T): T {
  if (prev === _next) {
    return prev
  }

  const next = _next as any

  const array = Array.isArray(prev) && Array.isArray(next)

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const prevSize = array ? prev.length : Object.keys(prev).length
    const nextItems = array ? next : Object.keys(next)
    const nextSize = nextItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < nextSize; i++) {
      const key = array ? i : nextItems[i]
      copy[key] = replaceEqualDeep(prev[key], next[key])
      if (copy[key] === prev[key]) {
        equalItems++
      }
    }

    return prevSize === nextSize && equalItems === prevSize ? prev : copy
  }

  return next
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export function trackDeep<T>(obj: T): T {
  const seen = new Set()

  JSON.stringify(obj, (_, value) => {
    if (typeof value === 'function') {
      return undefined
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return
      seen.add(value)
    }

    return value
  })

  return obj
}
