import { createFileRoute } from '@tanstack/react-router'

const state = { count: 0 }

export const Route = createFileRoute('/method-options')({
  loader() {
    return state
  },
  get component() {
    return () => <div>{state.count}</div>
  },
  set component(_value) {
    state.count++
  },
  errorComponent: () => <div>{state.count}</div>,
})
