import * as React from 'react'
import type { RouterRenderer } from '@tanstack/react-router/native'
import type {
  ErrorComponentProps,
  NotFoundRouteProps,
} from '@tanstack/router-core'

export function NativeScriptErrorComponent({
  error,
  reset,
}: ErrorComponentProps) {
  return React.createElement(
    'stacklayout',
    { padding: 24, verticalAlignment: 'middle' },
    React.createElement('label', {
      text: 'Something went wrong',
      fontSize: 20,
      fontWeight: 'bold',
    }),
    React.createElement('label', {
      text: error.message || String(error),
      textWrap: true,
      marginTop: 8,
      color: '#b91c1c',
    }),
    React.createElement('button', {
      text: 'Try again',
      onTap: reset,
      marginTop: 16,
    }),
  )
}

export function NativeScriptNotFoundComponent(_props: NotFoundRouteProps) {
  return React.createElement(
    'stacklayout',
    { padding: 24, verticalAlignment: 'middle' },
    React.createElement('label', {
      text: 'Not Found',
      fontSize: 20,
      fontWeight: 'bold',
    }),
  )
}

export const nativeScriptRouterRenderer: RouterRenderer = {
  errorComponent: NativeScriptErrorComponent,
  notFoundComponent: NativeScriptNotFoundComponent,
}
