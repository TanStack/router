import { bench, describe, expect } from 'vitest'

type Match = { status: string; _notFound?: boolean }

// Isolate the settled-ancestor selection mechanism from navigation, timers,
// and rendering. Both versions must select the same boundary before timing.
function original(matches: Array<Match>, painted: number) {
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    if (match.status === 'success' && !match._notFound) {
      let hasPendingDescendant = false
      for (let next = index + 1; next < matches.length; next++) {
        const descendant = matches[next]!
        if (descendant.status !== 'success' || descendant._notFound) {
          hasPendingDescendant = true
          break
        }
      }
      if (hasPendingDescendant || index !== painted) {
        continue
      }
    }
    return index
  }
  return -1
}

function candidate(matches: Array<Match>, painted: number) {
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    if (match.status === 'success' && !match._notFound) {
      if (index !== painted) {
        continue
      }
      for (let next = index + 1; next < matches.length; next++) {
        const descendant = matches[next]!
        if (descendant.status !== 'success' || descendant._notFound) {
          index = next
          break
        }
      }
    }
    return index
  }
  return -1
}

for (const depth of [4, 8, 32]) {
  const settled = Array.from({ length: depth }, () => ({ status: 'success' }))
  const pending = [...settled.slice(0, -1), { status: 'pending' }]
  const notFound = [
    ...settled.slice(0, -1),
    { status: 'success', _notFound: true },
  ]
  const cases: Array<[string, Array<Match>, number, number]> = [
    ['unpainted settled ancestors', pending, -1, depth - 1],
    ['painted ancestor with pending leaf', pending, 1, depth - 1],
    ['painted boundary near pending leaf', pending, depth - 2, depth - 1],
    ['painted ancestor with not-found leaf', notFound, 1, depth - 1],
    ['terminal painted success', settled, depth - 1, depth - 1],
    ['all settled and unpainted', settled, -1, -1],
    ['unresolved root', [{ status: 'pending' }, ...settled], 0, 0],
  ]
  for (const [name, matches, painted, expected] of cases) {
    expect(original(matches, painted)).toBe(expected)
    expect(candidate(matches, painted)).toBe(expected)
    describe(`${depth} matches: ${name}`, () => {
      for (const [label, select] of [
        ['original', original],
        ['candidate', candidate],
      ] as const) {
        bench(
          label,
          () => {
            let result = 0
            for (let iteration = 0; iteration < 128; iteration++) {
              result += select(matches, painted)
            }
            if (result !== expected * 128) {
              throw new Error('Unexpected pending boundary')
            }
          },
          { time: 300, warmupTime: 100 },
        )
      }
    })
  }
  describe(`${depth} matches: mixed presentations`, () => {
    for (const [label, select] of [
      ['original', original],
      ['candidate', candidate],
    ] as const) {
      bench(
        label,
        () => {
          for (let iteration = 0; iteration < 128; iteration++) {
            const [, matches, painted, expected] =
              cases[iteration % cases.length]!
            if (select(matches, painted) !== expected) {
              throw new Error('Unexpected pending boundary')
            }
          }
        },
        { time: 300, warmupTime: 100 },
      )
    }
  })
}
