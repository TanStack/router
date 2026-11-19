import { afterEach, expect, test, vi } from 'vitest'
import { createBrowserHistory, createHashHistory } from '../src'

const originalHref = window.location.href
const originalState = window.history.state
let history: ReturnType<typeof createBrowserHistory>

afterEach(() => {
  history.destroy()
  vi.restoreAllMocks()
  window.history.replaceState(originalState, '', originalHref)
})

function visit(...paths: Array<string>) {
  history = createBrowserHistory()
  paths.forEach((path, i) => {
    history[i ? 'push' : 'replace'](path)
    history.flush()
  })
}

// Entries the router did not create have no index or key to tell them apart.
function visitNullState(kind: 'browser' | 'hash', paths: Array<string>) {
  const href = (path: string) => (kind === 'hash' ? `/hash#${path}` : path)
  window.history.replaceState(null, '', href('/start'))
  history = kind === 'hash' ? createHashHistory() : createBrowserHistory()
  paths.forEach((path) => window.history.pushState(null, '', href(path)))
  history.push('/current')
  history.flush()
}

// A macrotask, so an extra async hop cannot make a negative assertion pass.
function settle() {
  return new Promise((resolve) => setTimeout(resolve))
}

function blockWithAnswers() {
  const answers: Array<(blocked: boolean) => void> = []
  const unblock = history.block({
    blockerFn: () => new Promise<boolean>((resolve) => answers.push(resolve)),
    enableBeforeUnload: false,
  })
  const subscriber = vi.fn()
  history.subscribe(subscriber)
  const traverse = async (move: () => void) => {
    const asked = answers.length + 1
    move()
    await vi.waitFor(() => expect(answers).toHaveLength(asked))
  }
  return { answers, subscriber, traverse, unblock }
}

test.each([
  ['push', true, '/first'],
  ['push', false, '/first'],
  ['replace', true, '/start'],
  ['replace', false, '/start'],
] as const)(
  'ignores a late answer after a %s (blocked: %s)',
  async (method, blocked, afterBack) => {
    visit('/start', '/first', '/second')
    const { answers, subscriber, traverse, unblock } = blockWithAnswers()
    await traverse(() => history.back())

    history[method]('/new', undefined, { ignoreBlocker: true })
    history.flush()
    unblock()
    subscriber.mockClear()
    answers[0]!(blocked)
    await settle()
    expect(subscriber).not.toHaveBeenCalled()

    history.back()
    await vi.waitFor(() => expect(window.location.pathname).toBe(afterBack))
    expect(history.location.pathname).toBe(afterBack)
    expect(subscriber).toHaveBeenCalledOnce()
  },
)

test('asks again on the next Back when the blocker stays mounted', async () => {
  visit('/start', '/first', '/second')
  const { answers, traverse } = blockWithAnswers()
  await traverse(() => history.back())

  history.push('/new', undefined, { ignoreBlocker: true })
  history.flush()
  answers[0]!(true)
  await settle()

  await traverse(() => history.back())
  expect(window.location.pathname).toBe('/first')
  expect(history.location.pathname).toBe('/new')

  answers[1]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
  expect(window.location.pathname).toBe('/first')
})

test('ignores an older answer after another traversal', async () => {
  visit('/start', '/first', '/second', '/third')
  const go = vi.spyOn(window.history, 'go')
  const { answers, subscriber, traverse } = blockWithAnswers()
  await traverse(() => history.back())
  await traverse(() => history.back())

  answers[0]!(true)
  await settle()
  expect(go).not.toHaveBeenCalled()

  answers[1]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
  expect(window.location.pathname).toBe('/first')
  expect(subscriber).toHaveBeenCalledOnce()
})

test('ignores the oldest answer after Back, Forward, Back to the same entry', async () => {
  visit('/start', '/first', '/second', '/third')
  const go = vi.spyOn(window.history, 'go')
  const { answers, subscriber, traverse } = blockWithAnswers()
  await traverse(() => history.back())
  await traverse(() => history.forward())
  await traverse(() => history.back())

  answers[0]!(true)
  answers[2]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/second'))
  expect(go).not.toHaveBeenCalled()
  expect(window.location.pathname).toBe('/second')
  expect(subscriber).toHaveBeenCalledOnce()
})

test.each([
  ['browser', '/second'],
  ['hash', '/second'],
  ['browser', '/first'],
  ['hash', '/first'],
] as const)(
  'ignores a stale answer between null-state %s entries, newest %s',
  async (kind, newest) => {
    visitNullState(kind, ['/first', newest])
    const { answers, subscriber, traverse } = blockWithAnswers()
    await traverse(() => history.back())
    await traverse(() => history.back())

    answers[0]!(false)
    await settle()
    expect(subscriber).not.toHaveBeenCalled()

    answers[1]!(false)
    await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
    expect(subscriber).toHaveBeenCalledOnce()
  },
)

test('stay does not call go(0) when the traversal has no index difference', async () => {
  visit('/start', '/first', '/second')
  const go = vi.spyOn(window.history, 'go')
  const { answers, traverse } = blockWithAnswers()
  await traverse(() => history.back())
  await traverse(() => history.forward())

  answers[1]!(true)
  await settle()
  expect(go).not.toHaveBeenCalled()
  expect(history.location.pathname).toBe('/second')

  await traverse(() => history.back())
  answers[2]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
  expect(window.location.pathname).toBe('/first')
})

test('stay does not call go(NaN) when the entry has no router index', async () => {
  visit('/start', '/first')
  // A null state reads as index 0, so only other state leaves it undefined.
  window.history.pushState({ other: 1 }, '', '/foreign')
  history.push('/current')
  history.flush()
  const go = vi.spyOn(window.history, 'go')
  const { answers, traverse } = blockWithAnswers()
  await traverse(() => history.back())

  answers[0]!(true)
  await settle()
  expect(go).not.toHaveBeenCalled()

  await traverse(() => history.back())
  answers[1]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
  expect(window.location.pathname).toBe('/first')
})

test('guard: restores a blocked back and allows the next one', async () => {
  visit('/start', '/first')
  const unblock = history.block({
    blockerFn: () => true,
    enableBeforeUnload: false,
  })
  const subscriber = vi.fn()
  history.subscribe(subscriber)

  history.back()
  await vi.waitFor(() => expect(subscriber).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(window.location.pathname).toBe('/first'))
  expect(history.location.pathname).toBe('/first')

  unblock()
  history.back()
  await vi.waitFor(() => expect(history.location.pathname).toBe('/start'))
})

test('guard: an allowed async answer moves to a null-state entry', async () => {
  visitNullState('browser', ['/first'])
  const { answers, subscriber, traverse } = blockWithAnswers()
  await traverse(() => history.back())

  answers[0]!(false)
  await vi.waitFor(() => expect(history.location.pathname).toBe('/first'))
  expect(subscriber).toHaveBeenCalledOnce()
})
