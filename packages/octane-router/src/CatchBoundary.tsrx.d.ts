import type { ComponentBody } from 'octane'
import type { ErrorComponentProps } from '@tanstack/router-core'
import type { ErrorRouteComponent } from './frameworkTypes'

export interface CatchBoundaryProps {
  getResetKey: () => number | string
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: { componentStack: string }) => void
  children?: unknown
}

export declare const CatchBoundary: ComponentBody<CatchBoundaryProps>
export declare const ErrorComponent: ComponentBody<ErrorComponentProps<unknown>>
