import { ErrorComponent } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

/**
 * Displays the given routing error.
 *
 * @param error - The error object provided by the router for the failed route.
 * @returns A JSX element that renders the error UI.
 */
export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}
