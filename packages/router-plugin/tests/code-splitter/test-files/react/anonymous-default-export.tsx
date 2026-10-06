import { createFileRoute } from '@tanstack/react-router'

const cache = new Map<string, string>()

export const Route = createFileRoute('/')({
  loader: () => cache.get('title'),
  component: () => <div>{cache.size}</div>,
})

export default function () {
  return null
}
