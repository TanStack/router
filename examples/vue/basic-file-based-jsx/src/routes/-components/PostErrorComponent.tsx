import { ErrorComponent } from '@tanstack/vue-router'
import type { ErrorComponentProps } from '@tanstack/vue-router'

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}
