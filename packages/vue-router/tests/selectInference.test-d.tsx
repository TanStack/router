import { test } from 'vitest'
import {
  useChildMatches,
  useLocation,
  useMatch,
  useMatches,
  useParentMatches,
  useRouterState,
} from '../src'
import type * as Vue from 'vue'

// Without `select`, a hook's result is the resolved type wherever the call
// sits: `TSelected` must not be inferred from the expected type.

test('hooks without select are not inferred from the expected type', () => {
  // @ts-expect-error router state is not a number
  const routerState: Vue.Ref<number> = useRouterState()
  // @ts-expect-error location is not a number
  const location: Vue.Ref<number> = useLocation()
  // @ts-expect-error matches are not a number
  const matches: Vue.Ref<number> = useMatches()
  // @ts-expect-error matches are not a number
  const parentMatches: Vue.Ref<number> = useParentMatches()
  // @ts-expect-error matches are not a number
  const childMatches: Vue.Ref<number> = useChildMatches()
  // @ts-expect-error a match is not a number
  const match: Vue.Ref<number> = useMatch({ strict: false })
  void [routerState, location, matches, parentMatches, childMatches, match]
})
