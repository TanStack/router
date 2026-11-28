/**
 * A trap on names of a page's global object, for behavioural checks that a
 * page never touches a development global (SPEC G7: dev support shipped
 * without its guard fails even where no text of it is left to find).
 *
 * `globalTrapSource` gives the source of a JavaScript expression to run in
 * the page before any of the page's own code (an init script, or the first
 * module of the app). It defines each trapped name on the global object as
 * an accessor and records every way code touches it:
 * - a read or a write (also through a bare identifier: `$RefreshReg$(…)`,
 *   `typeof $RefreshSig$`);
 * - an own-property probe of the global object (`hasOwnProperty`,
 *   `Object.hasOwn`, `propertyIsEnumerable`, `getOwnPropertyDescriptor`,
 *   `Reflect.has`);
 * - a definition on it (`Object.defineProperty`, `defineProperties`,
 *   `Reflect.defineProperty`), and a deletion or redefinition found later.
 *
 * An `in` probe (`'$RefreshReg$' in window`) cannot be recorded itself: a
 * browser's global object is no proxy, and every object of its prototype
 * chain has an immutable prototype (HTML), so no code sees the lookup. The
 * accessor makes such a probe true, so the code it guards runs, and what
 * that code then reads or writes is recorded (the controls in
 * `tests/integration/global-trap.test.ts`).
 *
 * The expression evaluates to a function that returns the touches so far,
 * each `<kind> <name>` (with the stack that made it when `stacks` is set).
 */
export function globalTrapSource(options: {
  /** A JavaScript expression that evaluates to the names (an array). */
  names: string
  /** Record the stack of each touch after its kind and name. */
  stacks?: boolean
}): string {
  return `(() => {
  // (not called names: the expression may read a binding of that name)
  const trappedNames = [...${options.names}]
  const trapped = new Set(trappedNames)
  const touched = []
  const record = (kind, name) => {
    touched.push(kind + ' ' + String(name)${options.stacks ? ` + '\\n' + new Error().stack` : ''})
  }
  const describe = Object.getOwnPropertyDescriptor
  const define = Object.defineProperty
  const accessors = new Map()
  for (const name of trappedNames) {
    let value
    const accessor = {
      configurable: true,
      get() {
        record('read', name)
        return value
      },
      set(next) {
        record('write', name)
        value = next
      },
    }
    accessors.set(name, accessor.get)
    define(globalThis, name, accessor)
  }
  // Own-property probes and definitions on the global object
  const wrap = (owner, method, kind, objectOf, keysOf) => {
    const original = owner[method]
    define(owner, method, {
      configurable: true,
      writable: true,
      value: {
        [method](...args) {
          if (objectOf(this, args) === globalThis) {
            for (const key of keysOf(args)) {
              if (trapped.has(key)) {
                record(kind, key)
              }
            }
          }
          return Reflect.apply(original, this, args)
        },
      }[method],
    })
  }
  const self = (that) => that
  const first = (_, args) => args[0]
  const key0 = (args) => [args[0]]
  const key1 = (args) => [args[1]]
  wrap(Object.prototype, 'hasOwnProperty', 'probe', self, key0)
  wrap(Object.prototype, 'propertyIsEnumerable', 'probe', self, key0)
  wrap(Object, 'hasOwn', 'probe', first, key1)
  wrap(Object, 'getOwnPropertyDescriptor', 'probe', first, key1)
  wrap(Reflect, 'getOwnPropertyDescriptor', 'probe', first, key1)
  wrap(Reflect, 'has', 'probe', first, key1)
  wrap(Object, 'defineProperty', 'define', first, key1)
  wrap(Reflect, 'defineProperty', 'define', first, key1)
  wrap(Object, 'defineProperties', 'define', first, (args) =>
    args[1] && typeof args[1] === 'object' ? Reflect.ownKeys(args[1]) : [],
  )
  return () => [
    ...touched,
    // A name deleted or redefined since (without a recorded definition:
    // \`delete\`, or a definition through another realm)
    ...trappedNames
      .filter((name) => describe(globalThis, name)?.get !== accessors.get(name))
      .map((name) => 'redefined ' + name),
  ]
})()`
}
