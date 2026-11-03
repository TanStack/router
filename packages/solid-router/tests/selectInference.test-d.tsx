import { test } from 'vitest'
import {
  useChildMatches,
  useLocation,
  useMatch,
  useMatches,
  useParentMatches,
  useRouterState,
} from '../src'
import type { Accessor } from 'solid-js'

// Without `select`, a hook's result is the resolved type wherever the call
// sits: `TSelected` must not be inferred from the expected type.

test('hooks without select are not inferred from the expected type', () => {
  // @ts-expect-error router state is not a number
  const routerState: Accessor<number> = useRouterState()
  // @ts-expect-error location is not a number
  const location: Accessor<number> = useLocation()
  // @ts-expect-error matches are not a number
  const matches: Accessor<number> = useMatches()
  // @ts-expect-error matches are not a number
  const parentMatches: Accessor<number> = useParentMatches()
  // @ts-expect-error matches are not a number
  const childMatches: Accessor<number> = useChildMatches()
  // @ts-expect-error a match is not a number
  const match: Accessor<number> = useMatch({ strict: false })
  void [routerState, location, matches, parentMatches, childMatches, match]
})
