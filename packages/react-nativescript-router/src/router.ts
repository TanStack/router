import { Router as ReactRouter } from '@tanstack/react-router/native'
import { isDangerousProtocol } from '@tanstack/router-core'
import {
  AbortController as NativeScriptAbortController,
  AbortSignal as NativeScriptAbortSignal,
} from '@nativescript/core/abortcontroller'
import { openUrlAsync } from '@nativescript/core/utils'
import { createNativeScriptHistory } from './history'
import { resolveNativeScriptNavigateOptions } from './native-navigation'
import type { AnyRoute } from '@tanstack/react-router/native'
import type {
  NavigateFn,
  RouterConstructorOptions,
  StackBehavior,
  TrailingSlashOption,
} from '@tanstack/router-core'
import type {
  NativeScriptHistoryOptions,
  NativeScriptRouterHistory,
} from './history'
import type { NativeScriptLinkingOptions } from './linking'

export interface NativeScriptRouterOptions {
  linking?: false | NativeScriptLinkingOptions
  /** Default native stack policy used by Link and useNavigate. */
  defaultStackBehavior?: StackBehavior
  /** Override how absolute URLs are handed to the host platform. */
  openExternalUrl?: (url: string) => boolean | void | Promise<boolean | void>
}

declare module '@tanstack/router-core' {
  interface RouterOptionsExtensions {
    native?: NativeScriptRouterOptions
  }
}

if (typeof globalThis.self === 'undefined') {
  Object.assign(globalThis, { self: globalThis })
}

if (typeof globalThis.AbortController === 'undefined') {
  Object.assign(globalThis, {
    AbortController: NativeScriptAbortController,
    AbortSignal: NativeScriptAbortSignal,
  })
}

export type CreateNativeScriptRouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    NativeScriptRouterHistory,
    TDehydrated
  >,
  'history'
> &
  Pick<NativeScriptHistoryOptions, 'initialPath'>

export type CreateNativeScriptRouterFn = <
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: CreateNativeScriptRouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TDehydrated
  >,
) => NativeScriptRouter<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TDehydrated
>

export class NativeScriptRouter<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption = 'never',
  in out TDefaultStructuralSharingOption extends boolean = false,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends ReactRouter<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  NativeScriptRouterHistory,
  TDehydrated
> {
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      NativeScriptRouterHistory,
      TDehydrated
    >,
  ) {
    super(options)

    const navigate = this.navigate
    this.navigate = (async (options) => {
      const href = options.href ? String(options.href) : undefined
      let isExternal = false
      if (href) {
        try {
          new URL(href)
          isExternal = true
        } catch {
          // Relative hrefs continue through normal Router navigation.
        }
      }

      if (href && isExternal) {
        if (isDangerousProtocol(href, this.protocolAllowlist)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked navigation to dangerous protocol: ${href}`)
          }
          return
        }

        if (!options.ignoreBlocker) {
          for (const blocker of this.history.getBlockers()) {
            const isBlocked = await blocker.blockerFn({
              currentLocation: this.history.location,
              nextLocation: this.history.location,
              action: 'PUSH',
            })
            if (isBlocked) {
              return
            }
          }
        }

        const nativeOptions = this.options.native as NativeScriptRouterOptions
        const opened = await (nativeOptions.openExternalUrl ?? openUrlAsync)(
          href,
        )
        if (opened === false) {
          throw new Error(`NativeScript could not open external URL: ${href}`)
        }
        return
      }

      const resolved = resolveNativeScriptNavigateOptions(
        this,
        options as never,
      )
      return navigate({ ...resolved, reloadDocument: false } as never)
    }) as NavigateFn
  }
}

/** Create a React Router backed by NativeScript-compatible memory history. */
export function createNativeScriptRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: CreateNativeScriptRouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TDehydrated
  >,
): NativeScriptRouter<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TDehydrated
> {
  const { initialPath, ...routerOptions } = options
  const resolvedOptions = {
    ...routerOptions,
    history: createNativeScriptHistory({ initialPath }),
  } as RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    NativeScriptRouterHistory,
    TDehydrated
  >

  return new NativeScriptRouter<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TDehydrated
  >(resolvedOptions)
}
