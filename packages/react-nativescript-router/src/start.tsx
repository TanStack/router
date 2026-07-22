import * as React from 'react'
import { Application } from '@nativescript/core'
import { startReactApp } from '@nativescript-community/react'
import { NativeScriptRouterProvider } from './NativeScriptRouterProvider'
import type { AnyRouter } from '@tanstack/react-router/native'
import type { NativeScriptRouterProviderProps } from './NativeScriptRouterProvider'

export interface StartNativeScriptAppOptions<
  TRouter extends AnyRouter,
> extends Omit<NativeScriptRouterProviderProps<TRouter>, 'router'> {
  router: TRouter
  initialize?: () => Promise<void> | void
  root?: React.ReactNode
}

/** Initialize optional runtime state, then launch the NativeScript React app. */
export async function startNativeScriptApp<TRouter extends AnyRouter>({
  router,
  initialize,
  root,
  ...providerOptions
}: StartNativeScriptAppOptions<TRouter>): Promise<void> {
  await initialize?.()
  startReactApp({
    Application,
    root:
      root ??
      React.createElement(NativeScriptRouterProvider, {
        ...providerOptions,
        router,
      }),
  })
}
