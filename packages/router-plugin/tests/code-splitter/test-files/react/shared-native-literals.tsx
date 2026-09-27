import { createFileRoute } from '@tanstack/react-router'

// Both output modules must use the same mutable native regex value.
const pattern = /[a-zé]+/giu
const values = [123n, null, 'é😀', true] as const

export const Route = createFileRoute('/native-literals')({
  loader: () => ({ matched: pattern.test('café'), value: values[0] }),
  component: () => <div>{`${pattern.source}: ${values[0]}`}</div>,
})
