import type { ComponentBody } from 'octane'
import type {
  ErrorComponentProps,
  MetaDescriptor,
  NotFoundRouteProps,
  UseNavigateResult,
} from '@tanstack/router-core'
import type {
  UseLoaderDataRoute,
  UseLoaderDepsRoute,
  UseMatchRoute,
  UseParamsRoute,
  UseRouteContextRoute,
  UseSearchRoute,
} from './routeHookTypes'
import type { LinkComponentRoute } from './linkTypes'

export type OctaneElementAttributes = Record<
  string,
  string | number | boolean | null | undefined
>

export type OctaneScriptAttributes = OctaneElementAttributes & {
  children?: string
}

export interface DefaultRouteTypes<TProps> {
  component: ComponentBody<TProps>
}

export interface RouteTypes<TProps> extends DefaultRouteTypes<TProps> {}

export type AsyncRouteComponent<TProps> = RouteTypes<TProps>['component'] & {
  preload?: () => Promise<void>
}

export type RouteComponent = AsyncRouteComponent<Record<never, never>>

export type ErrorRouteComponent = AsyncRouteComponent<ErrorComponentProps>

export type NotFoundRouteComponent = RouteTypes<NotFoundRouteProps>['component']

declare module '@tanstack/router-core' {
  export interface RouteMatchExtensions {
    meta?: Array<MetaDescriptor | undefined>
    links?: Array<OctaneElementAttributes | undefined>
    scripts?: Array<OctaneScriptAttributes | undefined>
    styles?: Array<OctaneScriptAttributes | undefined>
    headScripts?: Array<OctaneScriptAttributes | undefined>
  }

  export interface UpdatableRouteOptionsExtensions {
    component?: RouteComponent
    errorComponent?: false | null | undefined | ErrorRouteComponent
    notFoundComponent?: NotFoundRouteComponent
    pendingComponent?: RouteComponent
  }

  export interface RootRouteOptionsExtensions {
    shellComponent?: ComponentBody<{ children?: unknown }>
  }

  export interface RouteExtensions<
    in out TId extends string,
    in out TFullPath extends string,
  > {
    useMatch: UseMatchRoute<TId>
    useRouteContext: UseRouteContextRoute<TId>
    useSearch: UseSearchRoute<TId>
    useParams: UseParamsRoute<TId>
    useLoaderDeps: UseLoaderDepsRoute<TId>
    useLoaderData: UseLoaderDataRoute<TId>
    useNavigate: () => UseNavigateResult<TFullPath>
    Link: LinkComponentRoute<TFullPath>
  }

  export interface RouterOptionsExtensions {
    defaultComponent?: RouteComponent
    defaultErrorComponent?: ErrorRouteComponent
    defaultPendingComponent?: RouteComponent
    defaultNotFoundComponent?: NotFoundRouteComponent
    Wrap?: ComponentBody<{ children?: unknown }>
    InnerWrap?: ComponentBody<{ children?: unknown }>
    defaultOnCatch?: (
      error: Error,
      errorInfo: { componentStack: string },
    ) => void
  }
}
