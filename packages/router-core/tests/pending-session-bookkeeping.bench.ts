import { bench, describe, expect } from 'vitest'

type Session = [
  object,
  string,
  number,
  undefined,
  boolean | Promise<boolean> | undefined,
  object,
]
type State = { pending?: Session; clears: number }
type Input = {
  owner: object
  id: string
  component: object
  painted: boolean
}

// Isolate session selection/ownership from clocks and rendering. Clearing a
// timer is counted so equivalence includes retiring a replaced session.
function original(state: State, input: Input) {
  let session = state.pending
  let tookOver = false
  if (session?.[1] === input.id) {
    tookOver = session[0] !== input.owner
    session[0] = input.owner
  } else {
    state.clears++
    state.pending = session = undefined
  }
  if (!session) {
    state.pending = session = [
      input.owner,
      input.id,
      100,
      undefined,
      input.painted || undefined,
      input.component,
    ]
  }
  if (session[4] && !tookOver && session[5] === input.component) {
    return false
  }
  session[5] = input.component
  return true
}

function candidate(state: State, input: Input) {
  let session = state.pending
  if (session?.[1] !== input.id) {
    state.clears++
    state.pending = session = [
      input.owner,
      input.id,
      100,
      undefined,
      input.painted,
      input.component,
    ]
  }
  if (
    session[4] &&
    session[0] === input.owner &&
    session[5] === input.component
  ) {
    return false
  }
  session[0] = input.owner
  session[5] = input.component
  return true
}

const owner = {}
const successor = {}
const component = {}
const lazyComponent = {}
const ack = Promise.resolve(true)
const input: Input = { owner, id: '/page', component, painted: false }
const cases: Array<[string, Session | undefined, Input]> = [
  ['new boundary', undefined, input],
  ['hydrated painted boundary', undefined, { ...input, painted: true }],
  [
    'same owner acknowledged',
    [owner, '/page', 100, undefined, true, component],
    input,
  ],
  [
    'same owner awaiting reveal',
    [owner, '/page', 100, undefined, undefined, component],
    input,
  ],
  [
    'successor acknowledged',
    [successor, '/page', 100, undefined, true, component],
    input,
  ],
  [
    'successor awaiting reveal',
    [successor, '/page', 100, undefined, undefined, component],
    input,
  ],
  [
    'lazy fallback replacement',
    [owner, '/page', 100, undefined, true, lazyComponent],
    input,
  ],
  [
    'same owner explicit false ack',
    [owner, '/page', 100, undefined, false, component],
    input,
  ],
  [
    'same owner render acknowledgement',
    [owner, '/page', 100, undefined, ack, component],
    input,
  ],
  [
    'successor render acknowledgement',
    [successor, '/page', 100, undefined, ack, component],
    input,
  ],
  [
    'different boundary',
    [owner, '/other', 100, undefined, true, component],
    input,
  ],
]

for (const [, session, value] of cases) {
  const before: State = {
    pending: session?.slice() as Session | undefined,
    clears: 0,
  }
  const after: State = {
    pending: session?.slice() as Session | undefined,
    clears: 0,
  }
  expect(candidate(after, value)).toBe(original(before, value))
  expect(after.clears).toBe(before.clears)
  expect(after.pending?.slice(0, 4)).toEqual(before.pending?.slice(0, 4))
  expect(Boolean(after.pending?.[4])).toBe(Boolean(before.pending?.[4]))
  expect(after.pending?.[5]).toBe(before.pending?.[5])
  if (session?.[4] instanceof Promise) {
    expect(after.pending?.[4]).toBe(session[4])
    expect(before.pending?.[4]).toBe(session[4])
  }
  expect(after.pending?.[0]).toBe(value.owner)
}

type Fixture = {
  state: State
  session: Session | undefined
  owner: object | undefined
  component: object | undefined
  input: Input
}

// Separate hot call sites avoid comparing a monomorphic first callback with
// a polymorphic second callback. Each loop directly calls its implementation.
function batchOriginal(fixtures: Array<Fixture>) {
  let offers = 0
  for (let iteration = 0; iteration < 128; iteration++) {
    const fixture = fixtures[iteration % fixtures.length]!
    if (fixture.session) {
      fixture.session[0] = fixture.owner!
      fixture.session[5] = fixture.component!
    }
    fixture.state.pending = fixture.session
    offers += Number(original(fixture.state, fixture.input))
  }
  return offers
}

function batchCandidate(fixtures: Array<Fixture>) {
  let offers = 0
  for (let iteration = 0; iteration < 128; iteration++) {
    const fixture = fixtures[iteration % fixtures.length]!
    if (fixture.session) {
      fixture.session[0] = fixture.owner!
      fixture.session[5] = fixture.component!
    }
    fixture.state.pending = fixture.session
    offers += Number(candidate(fixture.state, fixture.input))
  }
  return offers
}

for (const [name, distributions] of [
  ...cases.map((entry) => [entry[0], [entry]] as const),
  ['mixed sessions', cases] as const,
]) {
  describe(name, () => {
    for (const [label, batch] of [
      ['candidate', batchCandidate],
      ['original', batchOriginal],
    ] as const) {
      const fixtures: Array<Fixture> = distributions.map(
        ([, session, value]) => ({
          state: { pending: undefined, clears: 0 },
          session: session?.slice() as Session | undefined,
          owner: session?.[0],
          component: session?.[5],
          input: value,
        }),
      )
      const expected = batchOriginal(fixtures)
      expect(batchCandidate(fixtures)).toBe(expected)
      bench(
        label,
        () => {
          if (batch(fixtures) !== expected) {
            throw new Error('Unexpected offer count')
          }
        },
        { time: 500, warmupTime: 200 },
      )
    }
  })
}
