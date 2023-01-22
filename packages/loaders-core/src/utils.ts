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
export function isPlainObject(o: any) {
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
