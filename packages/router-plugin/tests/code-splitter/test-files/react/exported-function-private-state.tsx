import { createFileRoute } from '@tanstack/react-router'

const state = { count: 0 }

export function increment() {
  return ++state.count
}

let renders = 0

export function getRenders() {
  return renders
}

export function format(value: number) {
  return `#${value}`
}

function Page() {
  increment()
  renders++
  return (
    <p>
      {format(state.count)} {getRenders()}
    </p>
  )
}

export const Route = createFileRoute('/')({ component: Page })
