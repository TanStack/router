import { createFileRoute } from '@tanstack/react-router'
import { store } from './store'

const unsubscribe = store.subscribe(() => {
  if (store.state.done) {
    unsubscribe()
  }
})

export const Route = createFileRoute('/')({
  component: () => <div>{store.state.count}</div>,
})
