import type { ComponentBody } from 'octane'
import type { NotFoundError } from '@tanstack/router-core'

export interface CatchNotFoundProps {
  fallback?: (error: NotFoundError) => unknown
  onCatch?: (error: Error, errorInfo: { componentStack: string }) => void
  children?: unknown
}

export declare const CatchNotFound: ComponentBody<CatchNotFoundProps>
export declare const DefaultGlobalNotFound: ComponentBody<Record<never, never>>
