// Small hook utilities ported from react-router's utils.tsx. Plain-`.ts` hooks
// forward the caller's compiler-injected slot (see internal.ts).
import { useRef } from 'octane'
import { splitSlot, subSlot } from './internal'

// Returns the value from the previous render (null on first render). Ported from
// react-router's usePrevious — the previous/current pair lives in one ref cell and
// rolls forward during render when the incoming value changes.
export function usePrevious(...args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const value = user[0]
  const ref = useRef({ value, prev: null }, subSlot(slot, 'prev'))
  const current = ref.current.value
  if (value !== current) {
    ref.current = { value, prev: current }
  }
  return ref.current.prev
}
