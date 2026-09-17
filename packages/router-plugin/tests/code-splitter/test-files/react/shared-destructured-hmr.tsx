import { createFileRoute } from '@tanstack/react-router'
import { makeHelpers } from '../helpers'

const { read, render } = makeHelpers()

export const Route = createFileRoute('/hmr-probe')({
  loader: () => read(),
  component: () => render(),
  pendingComponent: render,
})
