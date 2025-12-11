import { ErrorComponent } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

/**
 * Renders an error UI for a routing error.
 *
 * @param error - The error object produced during route handling to display to the user.
 * @returns The rendered error UI element.
 */
export function UserErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}