import { createFileRoute } from '@tanstack/react-router'

export function format(value: string): string
export function format(value: number): string
export function format(value: string | number) {
  return String(value)
}

export { format as formatValue }

export const Route = createFileRoute('/overloads')({
  loader: () => format(42),
  component: () => <div>{format('label')}</div>,
})
