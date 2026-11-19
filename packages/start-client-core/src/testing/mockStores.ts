/**
 * Where `mockServerFn` and `mockMiddleware` keep their mocks, and how long a
 * mock lasts.
 *
 * A mock belongs to the test that registered it, or to the test file when it
 * was registered outside of a test (at the top of the file or in
 * `beforeAll`). A test's mocks end with the test.
 *
 * Which test is running comes from two places:
 *
 * - The async context of the test, where the test runner provides one (Node,
 *   and with it jsdom and happy-dom). A call made by code the test started
 *   then gets that test's mocks, also while other tests run concurrently.
 * - Without async context (browser mode), the test that started last. That is
 *   right for tests that run one after another. Concurrent tests there pass
 *   their test through the test context (`mockServerFn`,
 *   `resetServerFnMocks`), and a call gets the mock that was registered last.
 *
 * A mock registered for a test that has ended, by work the test did not wait
 * for, is an error: it would otherwise outlive its test.
 */

/** A running test, as the test runner identifies it. */
export type MockOwner = object

/** Set when the test runner has async context. */
let getAsyncOwner: (() => MockOwner | undefined) | undefined
/** The tests that have started and not finished, oldest first. */
const runningOwners = new Set<MockOwner>()
const registries = new Set<MockRegistry<unknown, unknown>>()

/** @internal Called by the setup file when the runner has async context. */
export function setAsyncOwnerSource(source: () => MockOwner | undefined) {
  getAsyncOwner = source
}

/** @internal Called by the setup file before a test runs. */
export function startTest(owner: MockOwner): void {
  runningOwners.add(owner)
}

/** @internal Called by the setup file after a test and its hooks have run. */
export function endTest(owner: MockOwner): void {
  runningOwners.delete(owner)
  for (const registry of registries) {
    registry.removeOwner(owner)
  }
}

const ENDED = Symbol('ended test')

/**
 * The test that code runs for: `owner` when one is given, otherwise the test
 * of the async context, or without async context the test that started last.
 * `undefined` when code runs for no test, `ENDED` when it runs for a test
 * that has ended (work the test left running).
 */
function resolveOwner(owner?: MockOwner): MockOwner | undefined | typeof ENDED {
  if (!owner && getAsyncOwner) {
    owner = getAsyncOwner()
  }
  if (owner) {
    return runningOwners.has(owner) ? owner : ENDED
  }
  if (getAsyncOwner) {
    return undefined
  }
  let last: MockOwner | undefined
  for (const running of runningOwners) {
    last = running
  }
  return last
}

interface MockEntry<TValue> {
  /** The test the mock belongs to, `undefined` for the file. */
  owner: MockOwner | undefined
  value: TValue
}

/** @internal The mocks of one kind, by what they replace. */
export class MockRegistry<TKey, TValue> {
  /** For each key the mocks of the file and of tests, in registration order. */
  private entries = new Map<TKey, Array<MockEntry<TValue>>>()

  constructor() {
    registries.add(this as MockRegistry<unknown, unknown>)
  }

  /** Registers for `owner`, or for the test that runs now, or for the file. */
  set(key: TKey, value: TValue, owner?: MockOwner): void {
    const resolved = resolveOwner(owner)
    if (resolved === ENDED) {
      throw new Error(
        'A mock was registered for a test that has already ended. ' +
          'Wait inside the test for the work that registers it.',
      )
    }
    const entries = (this.entries.get(key) ?? []).filter(
      (entry) => entry.owner !== resolved,
    )
    entries.push({ owner: resolved, value })
    this.entries.set(key, entries)
  }

  get(key: TKey): TValue | undefined {
    const asyncOwner = getAsyncOwner?.()
    let fileMock: TValue | undefined
    let testMock: TValue | undefined
    for (const entry of this.entries.get(key) ?? []) {
      if (!entry.owner) {
        fileMock = entry.value
      } else if (!asyncOwner || entry.owner === asyncOwner) {
        // (without async context, or from work that lost it, a call cannot
        // say which test made it: the mock registered last answers)
        testMock = entry.value
      }
    }
    return testMock ?? fileMock
  }

  /** Removes the mocks of `owner`, or of the test that runs now, or of the file. */
  clear(owner?: MockOwner): void {
    const resolved = resolveOwner(owner)
    if (resolved !== ENDED) {
      this.removeOwner(resolved)
    }
  }

  removeOwner(owner: MockOwner | undefined): void {
    for (const [key, entries] of this.entries) {
      const kept = entries.filter((entry) => entry.owner !== owner)
      if (kept.length) {
        this.entries.set(key, kept)
      } else {
        this.entries.delete(key)
      }
    }
  }
}
