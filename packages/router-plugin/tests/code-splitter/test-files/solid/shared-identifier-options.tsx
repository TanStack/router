import { createFileRoute } from '@tanstack/solid-router'

const seed = { value: 'shared' }
const { read, render } = {
  read: () => seed.value,
  render: () => <div>{seed.value}</div>,
}

const options = {
  codeSplitGroupings: [['component'], ['loader']],
  loader: () => read(),
  component: () => render(),
}

export const Route = createFileRoute('/shared-identifier-options')(options)
